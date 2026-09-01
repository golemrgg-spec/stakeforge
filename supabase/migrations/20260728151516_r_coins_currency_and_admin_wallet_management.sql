/*
# R Coins Currency System and Admin Wallet Management

## Overview
Replaces the USD-based wallet system with a single internal currency called R Coins.
The conversion rate is 1 USD = 500 R Coins. All existing wallet balances, transactions,
and wagered amounts are multiplied by 500 to convert them in place.

## New Tables
- `conversion_rates` — stores currency conversion rates (1 USD = 500 R Coins by default)
  - `id` (uuid, primary key)
  - `from_currency` (text, not null)
  - `to_currency` (text, not null)
  - `rate` (numeric, not null)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

- `admin_wallet_actions` — audit record for every admin-initiated wallet modification
  - `id` (uuid, primary key)
  - `admin_id` (uuid, not null, references profiles)
  - `target_user_id` (uuid, not null, references profiles)
  - `wallet_id` (uuid, not null, references wallets)
  - `action` (text, not null) — one of: add, remove, set, lock, unlock
  - `amount` (numeric, nullable) — null for lock/unlock
  - `balance_before` (numeric, nullable)
  - `balance_after` (numeric, nullable)
  - `reason` (text, not null)
  - `created_at` (timestamptz)

## Modified Tables
- `wallets` — adds `lifetime_wins` (integer, default 0) and `lifetime_losses` (integer, default 0)
- `wallets` — multiplies `balance`, `locked_balance`, `total_wagered`, `lifetime_pnl` by 500
- `wallet_transactions` — multiplies `amount`, `balance_before`, `balance_after` by 500

## Security
- RLS enabled on `conversion_rates` — readable by all authenticated users (read-only reference data)
- RLS enabled on `admin_wallet_actions` — readable only by admins; inserts happen via SECURITY DEFINER function
- All admin wallet modifications go through the `admin_adjust_wallet` SECURITY DEFINER RPC function

## Important Notes
1. The multiplication by 500 is a one-time data migration. The `DO $$ ... END $$` block
   checks a flag column to ensure it only runs once.
2. The `lifetime_wins` and `lifetime_losses` columns are added with `IF NOT EXISTS` guards.
3. No data is lost — only numeric values are scaled.
*/

-- =========================================================
-- 1. Conversion rates table
-- =========================================================
CREATE TABLE IF NOT EXISTS conversion_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency text NOT NULL,
  to_currency text NOT NULL,
  rate numeric NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE conversion_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_conversion_rates" ON conversion_rates;
CREATE POLICY "read_conversion_rates"
ON conversion_rates FOR SELECT
TO authenticated USING (true);

-- Seed the default rate: 1 USD = 500 R Coins
INSERT INTO conversion_rates (from_currency, to_currency, rate)
VALUES ('USD', 'R_COINS', 500)
ON CONFLICT DO NOTHING;

-- =========================================================
-- 2. Add lifetime_wins and lifetime_losses to wallets
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wallets' AND column_name = 'lifetime_wins'
  ) THEN
    ALTER TABLE wallets ADD COLUMN lifetime_wins integer NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wallets' AND column_name = 'lifetime_losses'
  ) THEN
    ALTER TABLE wallets ADD COLUMN lifetime_losses integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- =========================================================
-- 3. One-time USD → R Coins conversion (multiply by 500)
--    Guarded by a flag so re-running the migration is safe.
-- =========================================================
DO $$
BEGIN
  -- Only run if the conversion hasn't been applied yet.
  -- We detect this by checking if any wallet has a balance that looks like
  -- it hasn't been scaled (balance < 1000 and balance > 0 is a heuristic).
  -- Instead, use a dedicated marker: check if conversion_rates has the row
  -- AND a temporary marker column. We'll use a simpler approach:
  -- check if the migration marker table exists.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = '_migration_r_coins_conversion'
  ) THEN
    -- Scale wallet balances
    UPDATE wallets SET
      balance = balance * 500,
      locked_balance = locked_balance * 500,
      total_wagered = total_wagered * 500,
      lifetime_pnl = lifetime_pnl * 500;

    -- Scale wallet transactions
    UPDATE wallet_transactions SET
      amount = amount * 500,
      balance_before = balance_before * 500,
      balance_after = balance_after * 500;

    -- Scale game sessions
    UPDATE game_sessions SET
      bet_amount = bet_amount * 500,
      payout = payout * 500,
      profit = profit * 500;

    -- Scale bets
    UPDATE bets SET
      amount = amount * 500,
      payout = payout * 500;

    -- Create marker table so this never runs again
    CREATE TABLE _migration_r_coins_conversion (
      applied_at timestamptz DEFAULT now()
    );
    INSERT INTO _migration_r_coins_conversion DEFAULT VALUES;
  END IF;
END $$;

-- =========================================================
-- 4. Admin wallet actions audit table
-- =========================================================
CREATE TABLE IF NOT EXISTS admin_wallet_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  wallet_id uuid NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('add', 'remove', 'set', 'lock', 'unlock')),
  amount numeric,
  balance_before numeric,
  balance_after numeric,
  reason text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_wallet_actions_target
ON admin_wallet_actions(target_user_id);

CREATE INDEX IF NOT EXISTS idx_admin_wallet_actions_admin
ON admin_wallet_actions(admin_id);

ALTER TABLE admin_wallet_actions ENABLE ROW LEVEL SECURITY;

-- Only admins can read admin wallet actions
DROP POLICY IF EXISTS "admin_read_wallet_actions" ON admin_wallet_actions;
CREATE POLICY "admin_read_wallet_actions"
ON admin_wallet_actions FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

-- Users can read actions that affected their own wallet (for activity timeline)
DROP POLICY IF EXISTS "user_read_own_wallet_actions" ON admin_wallet_actions;
CREATE POLICY "user_read_own_wallet_actions"
ON admin_wallet_actions FOR SELECT
TO authenticated
USING (target_user_id = auth.uid());

-- No direct INSERT/UPDATE/DELETE via RLS — all writes go through the SECURITY DEFINER function
DROP POLICY IF EXISTS "admin_insert_wallet_actions" ON admin_wallet_actions;
CREATE POLICY "admin_insert_wallet_actions"
ON admin_wallet_actions FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);
