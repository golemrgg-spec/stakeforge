-- Update Minecraft deposit/withdraw to 1:1 MD (no conversion)
-- p_amount is in cents (Minecraft dollars * 100)
-- wallets.balance is also in cents. No conversion needed.

CREATE OR REPLACE FUNCTION minecraft_deposit(
  p_transfer_id text, p_minecraft_uuid text, p_amount bigint, p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_user_id uuid;
  v_existing record;
  v_new_balance numeric;
  v_wallet_id uuid;
BEGIN
IF p_amount IS NULL OR p_amount <= 0 THEN
  RAISE EXCEPTION 'Invalid amount';
END IF;

SELECT * INTO v_existing FROM wallet_transfers
WHERE idempotency_key = p_idempotency_key FOR UPDATE;

IF FOUND THEN
  SELECT balance INTO v_new_balance FROM wallets WHERE user_id = v_existing.user_id;
  RETURN jsonb_build_object('status', v_existing.status, 'transfer_id', v_existing.id, 'balance', v_new_balance, 'duplicate', true);
END IF;

SELECT ml.user_id INTO v_user_id FROM minecraft_links ml WHERE ml.minecraft_uuid = p_minecraft_uuid;
IF v_user_id IS NULL THEN RAISE EXCEPTION 'Minecraft account not linked to any website user'; END IF;

-- 1:1: p_amount is cents, wallets.balance is cents
UPDATE wallets
SET balance = balance + p_amount, updated_at = now()
WHERE user_id = v_user_id
RETURNING balance, id INTO v_new_balance, v_wallet_id;

INSERT INTO wallet_transactions (
  wallet_id, user_id, type, amount, balance_before, balance_after,
  reference_type, reference_id, description
) VALUES (
  v_wallet_id, v_user_id, 'deposit', p_amount,
  v_new_balance - p_amount, v_new_balance,
  'minecraft_transfer', gen_random_uuid(), 'Minecraft deposit'
);

INSERT INTO wallet_transfers (
  user_id, minecraft_uuid, direction, amount, status, idempotency_key, completed_at
) VALUES (
  v_user_id, p_minecraft_uuid, 'minecraft_to_web', p_amount,
  'completed', p_idempotency_key, now()
);

RETURN jsonb_build_object(
  'status', 'completed',
  'transfer_id', (SELECT id FROM wallet_transfers WHERE idempotency_key = p_idempotency_key),
  'balance', v_new_balance, 'duplicate', false
);
END;
$$;

CREATE OR REPLACE FUNCTION minecraft_withdraw(p_amount bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_link record;
  v_new_balance numeric;
  v_transfer_id uuid;
  v_idempotency_key text;
  v_wallet_id uuid;
BEGIN
IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;

SELECT * INTO v_link FROM minecraft_links WHERE user_id = v_user;
IF NOT FOUND THEN RAISE EXCEPTION 'No Minecraft account linked'; END IF;

-- 1:1: p_amount is cents, wallets.balance is cents
UPDATE wallets
SET balance = balance - p_amount, updated_at = now()
WHERE user_id = v_user AND balance >= p_amount
RETURNING balance, id INTO v_new_balance, v_wallet_id;

IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

INSERT INTO wallet_transactions (
  wallet_id, user_id, type, amount, balance_before, balance_after,
  reference_type, reference_id, description
) VALUES (
  v_wallet_id, v_user, 'withdrawal', -p_amount,
  v_new_balance + p_amount, v_new_balance,
  'minecraft_transfer', gen_random_uuid(), 'Minecraft cash out'
);

v_idempotency_key := 'withdraw_' || v_user || '_' || extract(epoch from now())::bigint;

INSERT INTO wallet_transfers (
  user_id, minecraft_uuid, direction, amount, status, idempotency_key
) VALUES (
  v_user, v_link.minecraft_uuid, 'web_to_minecraft', p_amount,
  'pending', v_idempotency_key
) RETURNING id INTO v_transfer_id;

RETURN jsonb_build_object(
  'status', 'pending', 'transfer_id', v_transfer_id,
  'balance', v_new_balance, 'idempotency_key', v_idempotency_key
);
END;
$$;

REVOKE EXECUTE ON FUNCTION minecraft_withdraw FROM anon;
GRANT EXECUTE ON FUNCTION minecraft_withdraw TO authenticated;

CREATE OR REPLACE FUNCTION minecraft_acknowledge_withdrawal(
  p_transfer_id uuid, p_idempotency_key text, p_success boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_transfer record;
  v_new_balance numeric;
BEGIN
SELECT * INTO v_transfer FROM wallet_transfers
WHERE id = p_transfer_id AND idempotency_key = p_idempotency_key AND status = 'pending'
FOR UPDATE SKIP LOCKED;

IF NOT FOUND THEN
  SELECT status INTO v_transfer.status FROM wallet_transfers WHERE id = p_transfer_id;
  RETURN jsonb_build_object('status', COALESCE(v_transfer.status, 'not_found'), 'duplicate', true);
END IF;

IF p_success THEN
  UPDATE wallet_transfers SET status = 'completed', completed_at = now() WHERE id = p_transfer_id;
  RETURN jsonb_build_object('status', 'completed', 'duplicate', false);
ELSE
  UPDATE wallets SET balance = balance + v_transfer.amount, updated_at = now()
  WHERE user_id = v_transfer.user_id RETURNING balance INTO v_new_balance;
  UPDATE wallet_transfers SET status = 'failed', completed_at = now() WHERE id = p_transfer_id;
  RETURN jsonb_build_object('status', 'failed', 'refunded_balance', v_new_balance, 'duplicate', false);
END IF;
END;
$$;
