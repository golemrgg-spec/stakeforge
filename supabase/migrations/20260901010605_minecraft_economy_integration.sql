/*
# Minecraft Economy Integration

## Purpose
Connects the gaming platform's virtual balance to a Minecraft Paper server economy via Supabase.
This is virtual in-game currency only — no real-money value.

## 1. One-Time Migration: Balance Reset
- Resets every existing user's gaming wallet balance to 0 exactly once.
- Does NOT reset on login or Minecraft join — only this migration runs once.
- Clears/cancels any old pending wallet transfer records.

## 2. New Tables

### minecraft_links
- `user_id` (uuid, PK, FK → profiles.id) — the website account
- `minecraft_uuid` (text, UNIQUE NOT NULL) — canonical Minecraft identity
- `minecraft_ign` (text, NOT NULL) — current username (can change)
- `verified_at` (timestamptz) — when the link was confirmed
- `created_at` (timestamptz)
- One Minecraft UUID cannot belong to multiple website accounts (UNIQUE constraint).
- UUID is canonical; IGN is display-only.

### gaming_wallets
- `user_id` (uuid, PK, FK → profiles.id) — one wallet per user
- `balance` (bigint, NOT NULL DEFAULT 0) — integer cents, NOT floating point
- `updated_at` (timestamptz)
- Replaces the old `wallets.balance` for Minecraft-connected operations.
- The existing `wallets` table remains for game engine operations; this table
  is the source of truth for Minecraft transfers.

### wallet_transfers
- `id` (uuid, PK)
- `user_id` (uuid, FK → profiles.id)
- `minecraft_uuid` (text) — the linked Minecraft account
- `direction` (enum: minecraft_to_web, web_to_minecraft)
- `amount` (bigint) — integer cents
- `status` (enum: pending, completed, failed)
- `idempotency_key` (text, UNIQUE NOT NULL) — prevents duplicate transfers
- `created_at` (timestamptz)
- `completed_at` (timestamptz, nullable)

### minecraft_link_codes
- `id` (uuid, PK)
- `user_id` (uuid, FK → profiles.id)
- `code` (text, NOT NULL) — 6-character alphanumeric verification code
- `minecraft_ign` (text, NOT NULL) — the IGN the user claims to own
- `expires_at` (timestamptz) — code expiry
- `used_at` (timestamptz, nullable)
- `created_at` (timestamptz)
- One active (unused, unexpired) code per user at a time.

## 3. Enums
- `transfer_direction`: 'minecraft_to_web', 'web_to_minecraft'
- `transfer_status`: 'pending', 'completed', 'failed'

## 4. Security (RLS)
- minecraft_links: users can SELECT their own link only. No direct INSERT/UPDATE/DELETE.
- gaming_wallets: users can SELECT their own wallet only. No direct INSERT/UPDATE/DELETE.
- wallet_transfers: users can SELECT their own transfers only. No direct INSERT/UPDATE/DELETE.
- minecraft_link_codes: users can SELECT their own codes. INSERT allowed for creating new codes.
- All balance modifications go through SECURITY DEFINER functions called by edge functions.

## 5. RPC Functions
- `generate_link_code(p_ign)`: Creates a verification code for the calling user.
- `verify_minecraft_link(p_code, p_minecraft_uuid, p_minecraft_ign)`: Called by edge function
  with service role. Verifies code, creates permanent link.
- `minecraft_deposit(p_transfer_id, p_minecraft_uuid, p_amount, p_idempotency_key)`: Called by
  edge function. Credits gaming_wallets atomically with idempotency.
- `minecraft_withdraw(p_amount)`: Called by authenticated user. Deducts balance, creates pending transfer.
- `minecraft_get_pending_withdrawals()`: Called by edge function with service role. Returns pending withdrawals.
- `minecraft_acknowledge_withdrawal(p_transfer_id, p_idempotency_key, p_success)`: Called by edge function.
  Marks transfer completed or failed.
- `get_gaming_wallet()`: Returns the calling user's gaming wallet balance.
- `get_minecraft_link()`: Returns the calling user's Minecraft link info.

## 6. Column Privileges
- gaming_wallets: REVOKE all writes from authenticated. Only SECURITY DEFINER functions modify it.
- minecraft_links: REVOKE all writes from authenticated. Only SECURITY DEFINER functions modify it.
- wallet_transfers: REVOKE all writes from authenticated. Only SECURITY DEFINER functions modify it.
*/

-- ============================================================
-- 1. ONE-TIME BALANCE RESET
-- ============================================================

-- Reset all existing wallet balances to 0 (one-time migration)
UPDATE wallets SET balance = 0, updated_at = now();

-- Clear any old pending wallet transactions that might be transfers
-- (No wallet_transfers table exists yet, but clear any pending-type records)
DELETE FROM wallet_transactions WHERE type = 'withdrawal' AND reference_type = 'minecraft_transfer';

-- ============================================================
-- 2. ENUMS
-- ============================================================

DO $$ BEGIN
  CREATE TYPE transfer_direction AS ENUM ('minecraft_to_web', 'web_to_minecraft');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE transfer_status AS ENUM ('pending', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 3. TABLES
-- ============================================================

-- Minecraft account links (UUID is canonical identity)
CREATE TABLE IF NOT EXISTS minecraft_links (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  minecraft_uuid text UNIQUE NOT NULL,
  minecraft_ign text NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE minecraft_links ENABLE ROW LEVEL SECURITY;

-- Gaming wallets (integer cents, one per user)
CREATE TABLE IF NOT EXISTS gaming_wallets (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  balance bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE gaming_wallets ENABLE ROW LEVEL SECURITY;

-- Wallet transfers (idempotent)
CREATE TABLE IF NOT EXISTS wallet_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  minecraft_uuid text NOT NULL,
  direction transfer_direction NOT NULL,
  amount bigint NOT NULL,
  status transfer_status NOT NULL DEFAULT 'pending',
  idempotency_key text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE wallet_transfers ENABLE ROW LEVEL SECURITY;

-- Minecraft link verification codes
CREATE TABLE IF NOT EXISTS minecraft_link_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  code text NOT NULL,
  minecraft_ign text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE minecraft_link_codes ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_wallet_transfers_user_id ON wallet_transfers(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transfers_status ON wallet_transfers(status);
CREATE INDEX IF NOT EXISTS idx_wallet_transfers_idempotency ON wallet_transfers(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_minecraft_link_codes_user_id ON minecraft_link_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_minecraft_link_codes_code ON minecraft_link_codes(code);

-- ============================================================
-- 5. RLS POLICIES
-- ============================================================

-- minecraft_links: read own only
DROP POLICY IF EXISTS "select_own_minecraft_links" ON minecraft_links;
CREATE POLICY "select_own_minecraft_links" ON minecraft_links
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- gaming_wallets: read own only
DROP POLICY IF EXISTS "select_own_gaming_wallets" ON gaming_wallets;
CREATE POLICY "select_own_gaming_wallets" ON gaming_wallets
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- wallet_transfers: read own only
DROP POLICY IF EXISTS "select_own_wallet_transfers" ON wallet_transfers;
CREATE POLICY "select_own_wallet_transfers" ON wallet_transfers
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- minecraft_link_codes: read own, insert own
DROP POLICY IF EXISTS "select_own_link_codes" ON minecraft_link_codes;
CREATE POLICY "select_own_link_codes" ON minecraft_link_codes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_link_codes" ON minecraft_link_codes;
CREATE POLICY "insert_own_link_codes" ON minecraft_link_codes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 6. COLUMN PRIVILEGES — deny direct writes
-- ============================================================

-- No direct INSERT/UPDATE/DELETE on gaming_wallets, minecraft_links, wallet_transfers
-- All modifications go through SECURITY DEFINER functions
REVOKE INSERT, UPDATE, DELETE ON gaming_wallets FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON minecraft_links FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON wallet_transfers FROM authenticated;

-- ============================================================
-- 7. RPC FUNCTIONS
-- ============================================================

-- Generate a 6-character verification code for the calling user
CREATE OR REPLACE FUNCTION generate_link_code(p_minecraft_ign text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_code text;
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_minecraft_ign IS NULL OR length(trim(p_minecraft_ign)) < 3 THEN
    RAISE EXCEPTION 'Invalid Minecraft username';
  END IF;

  -- Expire any old unused codes for this user
  UPDATE minecraft_link_codes
  SET used_at = now()
  WHERE user_id = v_user AND used_at IS NULL;

  -- Generate a random 6-char alphanumeric code
  v_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6));

  INSERT INTO minecraft_link_codes (user_id, code, minecraft_ign, expires_at)
  VALUES (v_user, v_code, trim(p_minecraft_ign), now() + interval '10 minutes');

  RETURN v_code;
END;
$$;

REVOKE EXECUTE ON FUNCTION generate_link_code FROM anon;
GRANT EXECUTE ON FUNCTION generate_link_code TO authenticated;

-- Verify a Minecraft link (called by edge function with service role)
CREATE OR REPLACE FUNCTION verify_minecraft_link(
  p_code text,
  p_minecraft_uuid text,
  p_minecraft_ign text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_link_code record;
BEGIN
  -- Atomic claim: get and lock the code in one statement
  SELECT * INTO v_link_code
  FROM minecraft_link_codes
  WHERE code = upper(p_code)
    AND used_at IS NULL
    AND expires_at > now()
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired code';
  END IF;

  -- Check UUID not already linked to another account
  IF EXISTS (
    SELECT 1 FROM minecraft_links
    WHERE minecraft_uuid = p_minecraft_uuid
  ) THEN
    RAISE EXCEPTION 'This Minecraft account is already linked to another website account';
  END IF;

  -- Create the permanent link
  INSERT INTO minecraft_links (user_id, minecraft_uuid, minecraft_ign, verified_at)
  VALUES (v_link_code.user_id, p_minecraft_uuid, p_minecraft_ign, now())
  ON CONFLICT (user_id) DO UPDATE
    SET minecraft_uuid = excluded.minecraft_uuid,
        minecraft_ign = excluded.minecraft_ign,
        verified_at = now();

  -- Mark code as used
  UPDATE minecraft_link_codes
  SET used_at = now()
  WHERE id = v_link_code.id;

  -- Create gaming wallet if it doesn't exist
  INSERT INTO gaming_wallets (user_id, balance)
  VALUES (v_link_code.user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN true;
END;
$$;

-- minecraft_deposit: credit gaming wallet atomically (called by edge function)
CREATE OR REPLACE FUNCTION minecraft_deposit(
  p_transfer_id text,
  p_minecraft_uuid text,
  p_amount bigint,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_existing record;
  v_new_balance bigint;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  -- Idempotency check: if this transfer already exists, return current state
  SELECT * INTO v_existing
  FROM wallet_transfers
  WHERE idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    -- Already processed, return the result
    SELECT balance INTO v_new_balance
    FROM gaming_wallets WHERE user_id = v_existing.user_id;

    RETURN jsonb_build_object(
      'status', v_existing.status,
      'transfer_id', v_existing.id,
      'balance', v_new_balance,
      'duplicate', true
    );
  END IF;

  -- Find the user by Minecraft UUID
  SELECT ml.user_id INTO v_user_id
  FROM minecraft_links ml
  WHERE ml.minecraft_uuid = p_minecraft_uuid;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Minecraft account not linked to any website user';
  END IF;

  -- Ensure gaming wallet exists
  INSERT INTO gaming_wallets (user_id, balance)
  VALUES (v_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  -- Atomically credit the wallet
  UPDATE gaming_wallets
  SET balance = balance + p_amount,
      updated_at = now()
  WHERE user_id = v_user_id
  RETURNING balance INTO v_new_balance;

  -- Record the transfer
  INSERT INTO wallet_transfers (
    user_id, minecraft_uuid, direction, amount, status, idempotency_key, completed_at
  )
  VALUES (
    v_user_id, p_minecraft_uuid, 'minecraft_to_web', p_amount,
    'completed', p_idempotency_key, now()
  );

  RETURN jsonb_build_object(
    'status', 'completed',
    'transfer_id', (SELECT id FROM wallet_transfers WHERE idempotency_key = p_idempotency_key),
    'balance', v_new_balance,
    'duplicate', false
  );
END;
$$;

-- minecraft_withdraw: deduct balance and create pending transfer (called by authenticated user)
CREATE OR REPLACE FUNCTION minecraft_withdraw(p_amount bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_link record;
  v_new_balance bigint;
  v_transfer_id uuid;
  v_idempotency_key text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  -- Get the user's Minecraft link
  SELECT * INTO v_link
  FROM minecraft_links
  WHERE user_id = v_user;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No Minecraft account linked';
  END IF;

  -- Atomically check balance and deduct
  UPDATE gaming_wallets
  SET balance = balance - p_amount,
      updated_at = now()
  WHERE user_id = v_user AND balance >= p_amount
  RETURNING balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  -- Generate idempotency key
  v_idempotency_key := 'withdraw_' || v_user || '_' || extract(epoch from now())::bigint;

  -- Create pending transfer
  INSERT INTO wallet_transfers (
    user_id, minecraft_uuid, direction, amount, status, idempotency_key
  )
  VALUES (
    v_user, v_link.minecraft_uuid, 'web_to_minecraft', p_amount,
    'pending', v_idempotency_key
  )
  RETURNING id INTO v_transfer_id;

  RETURN jsonb_build_object(
    'status', 'pending',
    'transfer_id', v_transfer_id,
    'balance', v_new_balance,
    'idempotency_key', v_idempotency_key
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION minecraft_withdraw FROM anon;
GRANT EXECUTE ON FUNCTION minecraft_withdraw TO authenticated;

-- minecraft_get_pending_withdrawals: return pending withdrawals (called by edge function)
CREATE OR REPLACE FUNCTION minecraft_get_pending_withdrawals()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_results jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'transfer_id', wt.id,
    'user_id', wt.user_id,
    'minecraft_uuid', wt.minecraft_uuid,
    'amount', wt.amount,
    'idempotency_key', wt.idempotency_key,
    'created_at', wt.created_at
  )), '[]'::jsonb)
  INTO v_results
  FROM wallet_transfers wt
  WHERE wt.direction = 'web_to_minecraft'
    AND wt.status = 'pending'
  ORDER BY wt.created_at ASC
  LIMIT 50;

  RETURN v_results;
END;
$$;

-- minecraft_acknowledge_withdrawal: mark transfer completed or failed (called by edge function)
CREATE OR REPLACE FUNCTION minecraft_acknowledge_withdrawal(
  p_transfer_id uuid,
  p_idempotency_key text,
  p_success boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_transfer record;
  v_new_balance bigint;
BEGIN
  -- Atomic claim: lock the transfer
  SELECT * INTO v_transfer
  FROM wallet_transfers
  WHERE id = p_transfer_id
    AND idempotency_key = p_idempotency_key
    AND status = 'pending'
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    -- Already processed or doesn't exist — return current state
    SELECT status INTO v_transfer.status
    FROM wallet_transfers WHERE id = p_transfer_id;

    RETURN jsonb_build_object(
      'status', COALESCE(v_transfer.status, 'not_found'),
      'duplicate', true
    );
  END IF;

  IF p_success THEN
    -- Mark as completed
    UPDATE wallet_transfers
    SET status = 'completed', completed_at = now()
    WHERE id = p_transfer_id;

    RETURN jsonb_build_object('status', 'completed', 'duplicate', false);
  ELSE
    -- Failed: refund the balance
    UPDATE gaming_wallets
    SET balance = balance + v_transfer.amount,
        updated_at = now()
    WHERE user_id = v_transfer.user_id
    RETURNING balance INTO v_new_balance;

    UPDATE wallet_transfers
    SET status = 'failed', completed_at = now()
    WHERE id = p_transfer_id;

    RETURN jsonb_build_object(
      'status', 'failed',
      'refunded_balance', v_new_balance,
      'duplicate', false
    );
  END IF;
END;
$$;

-- get_gaming_wallet: return the calling user's gaming wallet
CREATE OR REPLACE FUNCTION get_gaming_wallet()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_wallet record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Create wallet if it doesn't exist
  INSERT INTO gaming_wallets (user_id, balance)
  VALUES (v_user, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT user_id, balance, updated_at INTO v_wallet
  FROM gaming_wallets WHERE user_id = v_user;

  RETURN jsonb_build_object(
    'user_id', v_wallet.user_id,
    'balance', v_wallet.balance,
    'updated_at', v_wallet.updated_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION get_gaming_wallet FROM anon;
GRANT EXECUTE ON FUNCTION get_gaming_wallet TO authenticated;

-- get_minecraft_link: return the calling user's Minecraft link
CREATE OR REPLACE FUNCTION get_minecraft_link()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_link record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT user_id, minecraft_uuid, minecraft_ign, verified_at
  INTO v_link
  FROM minecraft_links
  WHERE user_id = v_user;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('linked', false);
  END IF;

  RETURN jsonb_build_object(
    'linked', true,
    'minecraft_uuid', v_link.minecraft_uuid,
    'minecraft_ign', v_link.minecraft_ign,
    'verified_at', v_link.verified_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION get_minecraft_link FROM anon;
GRANT EXECUTE ON FUNCTION get_minecraft_link TO authenticated;

-- get_wallet_transfers: return the calling user's transfer history
CREATE OR REPLACE FUNCTION get_wallet_transfers(p_limit int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_results jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', wt.id,
    'direction', wt.direction,
    'amount', wt.amount,
    'status', wt.status,
    'created_at', wt.created_at,
    'completed_at', wt.completed_at
  ) ORDER BY wt.created_at DESC), '[]'::jsonb)
  INTO v_results
  FROM wallet_transfers wt
  WHERE wt.user_id = v_user
  LIMIT p_limit;

  RETURN v_results;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_wallet_transfers FROM anon;
GRANT EXECUTE ON FUNCTION get_wallet_transfers TO authenticated;
