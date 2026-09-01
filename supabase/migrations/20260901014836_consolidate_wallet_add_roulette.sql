/*
# Consolidate to ONE canonical wallet + Add Roulette

## Problem
Minecraft deposits/withdrawals used `gaming_wallets.balance` (bigint cents)
while all games use `wallets.balance` (numeric R Coins). Two separate balances.

## Fix
1. minecraft_deposit: credit wallets.balance in R Coins (amount_cents / 100 * 500)
2. minecraft_withdraw: debit wallets.balance in R Coins
3. get_gaming_wallet: return wallets.balance as the canonical balance
4. minecraft_acknowledge_withdrawal: refund to wallets.balance
5. Add play_roulette_game RPC
6. Add roulette game_config

## Migration
- Copy any existing gaming_wallets balance into wallets (one-time, no double-credit)
- The edge function sends amount in dollars; we convert to R Coins at 500 RC/$1
*/

-- ============================================================
-- 1. ONE-TIME: Migrate gaming_wallets balance → wallets
-- ============================================================

-- Only run if there are gaming_wallets with non-zero balance
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count FROM gaming_wallets WHERE balance > 0;
  IF v_count > 0 THEN
    -- Credit each user's wallets.balance from their gaming_wallets.balance
    -- gaming_wallets stores integer cents; wallets stores R Coins (500 RC = $1)
    -- So: RC = cents / 100 * 500 = cents * 5
    UPDATE wallets w
    SET balance = w.balance + gw.balance * 5,
        updated_at = now()
    FROM gaming_wallets gw
    WHERE gw.user_id = w.user_id AND gw.balance > 0;

    -- Zero out gaming_wallets so we never double-credit
    UPDATE gaming_wallets SET balance = 0, updated_at = now() WHERE balance > 0;
  END IF;
END $$;

-- ============================================================
-- 2. REPLACE minecraft_deposit to credit wallets.balance
-- ============================================================

CREATE OR REPLACE FUNCTION minecraft_deposit(
  p_transfer_id text,
  p_minecraft_uuid text,
  p_amount bigint,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_user_id uuid;
  v_existing record;
  v_rc_amount numeric;
  v_new_balance numeric;
  v_wallet_id uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  -- Idempotency check
  SELECT * INTO v_existing
  FROM wallet_transfers
  WHERE idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    SELECT balance INTO v_new_balance FROM wallets WHERE user_id = v_existing.user_id;
    RETURN jsonb_build_object(
      'status', v_existing.status,
      'transfer_id', v_existing.id,
      'balance', v_new_balance,
      'duplicate', true
    );
  END IF;

  -- Find user by Minecraft UUID
  SELECT ml.user_id INTO v_user_id
  FROM minecraft_links ml
  WHERE ml.minecraft_uuid = p_minecraft_uuid;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Minecraft account not linked to any website user';
  END IF;

  -- Convert cents to R Coins: 500 RC = $1, so RC = cents / 100 * 500 = cents * 5
  v_rc_amount := p_amount * 5;

  -- Atomically credit the canonical wallet
  UPDATE wallets
  SET balance = balance + v_rc_amount,
      updated_at = now()
  WHERE user_id = v_user_id
  RETURNING balance, id INTO v_new_balance, v_wallet_id;

  -- Record wallet transaction
  INSERT INTO wallet_transactions (
    wallet_id, user_id, type, amount,
    balance_before, balance_after,
    reference_type, reference_id, description
  )
  VALUES (
    v_wallet_id, v_user_id, 'deposit', v_rc_amount,
    v_new_balance - v_rc_amount, v_new_balance,
    'minecraft_transfer', gen_random_uuid(), 'Minecraft deposit'
  );

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

-- ============================================================
-- 3. REPLACE minecraft_withdraw to debit wallets.balance
-- ============================================================

CREATE OR REPLACE FUNCTION minecraft_withdraw(p_amount bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_link record;
  v_rc_amount numeric;
  v_new_balance numeric;
  v_transfer_id uuid;
  v_idempotency_key text;
  v_wallet_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  SELECT * INTO v_link FROM minecraft_links WHERE user_id = v_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No Minecraft account linked';
  END IF;

  -- Convert cents to R Coins
  v_rc_amount := p_amount * 5;

  -- Atomically check and debit
  UPDATE wallets
  SET balance = balance - v_rc_amount,
      updated_at = now()
  WHERE user_id = v_user AND balance >= v_rc_amount
  RETURNING balance, id INTO v_new_balance, v_wallet_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  -- Record wallet transaction
  INSERT INTO wallet_transactions (
    wallet_id, user_id, type, amount,
    balance_before, balance_after,
    reference_type, reference_id, description
  )
  VALUES (
    v_wallet_id, v_user, 'withdrawal', -v_rc_amount,
    v_new_balance + v_rc_amount, v_new_balance,
    'minecraft_transfer', gen_random_uuid(), 'Minecraft cash out'
  );

  v_idempotency_key := 'withdraw_' || v_user || '_' || extract(epoch from now())::bigint;

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

-- ============================================================
-- 4. REPLACE minecraft_acknowledge_withdrawal to refund wallets
-- ============================================================

CREATE OR REPLACE FUNCTION minecraft_acknowledge_withdrawal(
  p_transfer_id uuid,
  p_idempotency_key text,
  p_success boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_transfer record;
  v_new_balance numeric;
  v_rc_amount numeric;
BEGIN
  SELECT * INTO v_transfer
  FROM wallet_transfers
  WHERE id = p_transfer_id
    AND idempotency_key = p_idempotency_key
    AND status = 'pending'
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    SELECT status INTO v_transfer.status
    FROM wallet_transfers WHERE id = p_transfer_id;
    RETURN jsonb_build_object(
      'status', COALESCE(v_transfer.status, 'not_found'),
      'duplicate', true
    );
  END IF;

  IF p_success THEN
    UPDATE wallet_transfers
    SET status = 'completed', completed_at = now()
    WHERE id = p_transfer_id;
    RETURN jsonb_build_object('status', 'completed', 'duplicate', false);
  ELSE
    -- Refund: convert cents back to R Coins
    v_rc_amount := v_transfer.amount * 5;
    UPDATE wallets
    SET balance = balance + v_rc_amount,
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

-- ============================================================
-- 5. REPLACE get_gaming_wallet to return canonical wallets.balance
-- ============================================================

CREATE OR REPLACE FUNCTION get_gaming_wallet()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_wallet record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT user_id, balance, updated_at INTO v_wallet
  FROM wallets WHERE user_id = v_user;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;

  RETURN jsonb_build_object(
    'user_id', v_wallet.user_id,
    'balance', v_wallet.balance,
    'updated_at', v_wallet.updated_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION get_gaming_wallet FROM anon;
GRANT EXECUTE ON FUNCTION get_gaming_wallet TO authenticated;

-- ============================================================
-- 6. ADD ROULETTE GAME CONFIG
-- ============================================================

INSERT INTO game_configs (game_type, house_edge, rtp, min_bet, max_bet, max_payout, custom)
VALUES ('roulette', 0.01, 0.99, 0.1, 10000000000, 50000000,
  jsonb_build_object(
    'colors', jsonb_build_array(
      jsonb_build_object('name', 'red', 'payout', 2, 'weight', 47),
      jsonb_build_object('name', 'purple', 'payout', 2, 'weight', 47),
      jsonb_build_object('name', 'yellow', 'payout', 14, 'weight', 6)
    )
  ))
ON CONFLICT (game_type) DO UPDATE SET
  house_edge = EXCLUDED.house_edge,
  rtp = EXCLUDED.rtp,
  custom = EXCLUDED.custom;

-- ============================================================
-- 7. ADD play_roulette_game RPC
-- Three-color slider roulette: Red 2x, Purple 2x, Yellow 14x
-- Probabilities: Red 47%, Purple 47%, Yellow 6% (house edge ~1%)
-- ============================================================

CREATE OR REPLACE FUNCTION play_roulette_game(
  p_bet_amount numeric,
  p_choice text,
  p_client_seed text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_cfg record;
  v_debit jsonb;
  v_dev boolean;
  v_server_seed text;
  v_seed_hash text;
  v_hmac bytea;
  v_nonce int;
  v_roll int;
  v_color text;
  v_payout numeric;
  v_profit numeric;
  v_after numeric;
  v_session_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_choice NOT IN ('red', 'purple', 'yellow') THEN
    RAISE EXCEPTION 'Invalid color choice';
  END IF;

  SELECT * INTO v_cfg FROM game_configs WHERE game_type = 'roulette';
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not configured'; END IF;
  IF p_bet_amount < v_cfg.min_bet OR p_bet_amount > v_cfg.max_bet THEN
    RAISE EXCEPTION 'Bet must be between % and %', v_cfg.min_bet, v_cfg.max_bet;
  END IF;

  -- Debit the bet from canonical wallet
  v_debit := game_debit(v_user, p_bet_amount);
  v_dev := (v_debit->>'dev')::boolean;

  -- Generate server seed
  v_server_seed := encode(gen_random_bytes(32), 'hex');
  v_seed_hash := encode(digest(v_server_seed, 'sha256'), 'hex');
  SELECT COUNT(*)::int INTO v_nonce FROM game_sessions WHERE user_id = v_user;

  -- Roll: 0-99
  -- 0-46 = red (47%), 47-93 = purple (47%), 94-99 = yellow (6%)
  v_hmac := hmac(v_server_seed, p_client_seed || ':' || v_nonce::text, 'sha256');
  v_roll := ((('x' || encode(substring(v_hmac, 1, 4), 'hex'))::bit(32)::bigint & x'7fffffff'::bigint) % 100)::int;

  IF v_roll < 47 THEN
    v_color := 'red';
  ELSIF v_roll < 94 THEN
    v_color := 'purple';
  ELSE
    v_color := 'yellow';
  END IF;

  -- Determine win
  IF v_color = p_choice THEN
    v_payout := CASE
      WHEN p_choice = 'yellow' THEN ROUND(p_bet_amount * 14, 2)
      ELSE ROUND(p_bet_amount * 2, 2)
    END;
    v_payout := LEAST(v_payout, v_cfg.max_payout);
  ELSE
    v_payout := 0;
  END IF;

  v_profit := v_payout - p_bet_amount;

  -- Create game session
  INSERT INTO game_sessions (
    user_id, game_type, status, bet_amount, payout, profit,
    client_seed, server_seed_hash, server_seed, nonce,
    config, result, started_at, ended_at
  )
  VALUES (
    v_user, 'roulette', 'completed', p_bet_amount, v_payout, v_profit,
    p_client_seed, v_seed_hash, v_server_seed, v_nonce,
    jsonb_build_object('choice', p_choice, 'dev_mode', v_dev),
    jsonb_build_object('roll', v_roll, 'color', v_color, 'won', v_color = p_choice),
    now(), now()
  )
  RETURNING id INTO v_session_id;

  -- Provably fair
  INSERT INTO provably_fair (
    session_id, user_id, game_type,
    server_seed, server_seed_hash, client_seed, nonce, hmac, revealed_at
  )
  VALUES (
    v_session_id, v_user, 'roulette',
    v_server_seed, v_seed_hash, p_client_seed, v_nonce,
    encode(v_hmac, 'hex'), now()
  );

  -- Record bet transaction
  PERFORM game_tx(v_user, 'bet', -p_bet_amount, (v_debit->>'before')::numeric, (v_debit->>'after')::numeric, v_session_id, 'Roulette bet', v_dev);

  -- Credit winnings
  v_after := game_credit(v_user, v_payout, v_profit, v_dev);
  IF v_payout > 0 THEN
    PERFORM game_tx(v_user, 'win', v_payout, v_after - v_payout, v_after, v_session_id, 'Roulette win', v_dev);
  END IF;

  RETURN jsonb_build_object(
    'session_id', v_session_id,
    'roll', v_roll,
    'color', v_color,
    'won', v_color = p_choice,
    'payout', v_payout,
    'profit', v_profit,
    'server_seed', v_server_seed,
    'server_seed_hash', v_seed_hash,
    'client_seed', p_client_seed,
    'nonce', v_nonce,
    'new_balance', v_after,
    'dev_mode', v_dev
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION play_roulette_game FROM anon;
GRANT EXECUTE ON FUNCTION play_roulette_game TO authenticated;
