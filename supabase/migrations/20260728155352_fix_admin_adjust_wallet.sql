-- =========================================================
-- Fix admin_adjust_wallet: properly set balance_before/balance_after
-- on wallet_transactions inserts so the trigger skips auto-update.
-- Also fix the lock/unlock paths to set balance fields on the tx.
-- =========================================================
CREATE OR REPLACE FUNCTION public.admin_adjust_wallet(
  p_target_user_id uuid,
  p_action text,
  p_amount numeric DEFAULT NULL,
  p_reason text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id uuid := auth.uid();
  v_admin_role text;
  v_wallet RECORD;
  v_balance_before numeric;
  v_balance_after numeric;
  v_locked_before numeric;
  v_locked_after numeric;
  v_tx_amount numeric;
  v_tx_type text;
BEGIN
  -- Validate caller is an admin
  SELECT role INTO v_admin_role FROM profiles WHERE id = v_admin_id;
  IF v_admin_role IS NULL OR v_admin_role <> 'admin' THEN
    RETURN json_build_object('error', 'Unauthorized: admin role required');
  END IF;

  -- Validate reason is not empty
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RETURN json_build_object('error', 'A reason is required for all wallet modifications');
  END IF;

  -- Validate action
  IF p_action NOT IN ('add', 'remove', 'set', 'lock', 'unlock') THEN
    RETURN json_build_object('error', 'Invalid action: must be add, remove, set, lock, or unlock');
  END IF;

  -- Lock the wallet row
  SELECT * INTO v_wallet FROM wallets WHERE user_id = p_target_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Wallet not found for target user');
  END IF;

  v_balance_before := v_wallet.balance;
  v_locked_before := v_wallet.locked_balance;
  v_tx_amount := 0;
  v_tx_type := 'adjustment';

  -- Perform the action
  IF p_action = 'add' THEN
    IF p_amount IS NULL OR p_amount <= 0 THEN
      RETURN json_build_object('error', 'Amount must be positive for add action');
    END IF;
    v_balance_after := v_balance_before + p_amount;
    v_tx_amount := p_amount;
    v_tx_type := 'bonus';

    -- Update wallet
    UPDATE wallets SET balance = v_balance_after, updated_at = now()
    WHERE user_id = p_target_user_id;

    -- Create wallet transaction (balance_after is set so trigger skips auto-update)
    INSERT INTO wallet_transactions (
      wallet_id, user_id, type, amount, balance_before, balance_after,
      reference_type, reference_id, description, metadata
    ) VALUES (
      v_wallet.id, p_target_user_id, v_tx_type, v_tx_amount, v_balance_before, v_balance_after,
      'admin_adjustment', v_admin_id, p_reason,
      json_build_object('admin_id', v_admin_id, 'action', p_action, 'amount', p_amount, 'reason', p_reason)
    );

  ELSIF p_action = 'remove' THEN
    IF p_amount IS NULL OR p_amount <= 0 THEN
      RETURN json_build_object('error', 'Amount must be positive for remove action');
    END IF;
    IF p_amount > v_balance_before THEN
      RETURN json_build_object('error', 'Insufficient balance: cannot remove more than current balance');
    END IF;
    v_balance_after := v_balance_before - p_amount;
    v_tx_amount := -p_amount;
    v_tx_type := 'adjustment';

    -- Update wallet
    UPDATE wallets SET balance = v_balance_after, updated_at = now()
    WHERE user_id = p_target_user_id;

    -- Create wallet transaction
    INSERT INTO wallet_transactions (
      wallet_id, user_id, type, amount, balance_before, balance_after,
      reference_type, reference_id, description, metadata
    ) VALUES (
      v_wallet.id, p_target_user_id, v_tx_type, v_tx_amount, v_balance_before, v_balance_after,
      'admin_adjustment', v_admin_id, p_reason,
      json_build_object('admin_id', v_admin_id, 'action', p_action, 'amount', p_amount, 'reason', p_reason)
    );

  ELSIF p_action = 'set' THEN
    IF p_amount IS NULL OR p_amount < 0 THEN
      RETURN json_build_object('error', 'Amount must be zero or positive for set action');
    END IF;
    v_balance_after := p_amount;
    v_tx_amount := p_amount - v_balance_before;
    v_tx_type := 'adjustment';

    -- Update wallet
    UPDATE wallets SET balance = v_balance_after, updated_at = now()
    WHERE user_id = p_target_user_id;

    -- Create wallet transaction
    INSERT INTO wallet_transactions (
      wallet_id, user_id, type, amount, balance_before, balance_after,
      reference_type, reference_id, description, metadata
    ) VALUES (
      v_wallet.id, p_target_user_id, v_tx_type, v_tx_amount, v_balance_before, v_balance_after,
      'admin_adjustment', v_admin_id, p_reason,
      json_build_object('admin_id', v_admin_id, 'action', p_action, 'amount', p_amount, 'reason', p_reason)
    );

  ELSIF p_action = 'lock' THEN
    -- Lock: move amount from balance to locked_balance
    IF p_amount IS NULL OR p_amount <= 0 THEN
      RETURN json_build_object('error', 'Amount must be positive for lock action');
    END IF;
    IF p_amount > v_balance_before THEN
      RETURN json_build_object('error', 'Insufficient balance: cannot lock more than current balance');
    END IF;
    v_balance_after := v_balance_before - p_amount;
    v_locked_after := v_locked_before + p_amount;

    -- Update wallet (both balance and locked_balance)
    UPDATE wallets SET
      balance = v_balance_after,
      locked_balance = v_locked_after,
      updated_at = now()
    WHERE user_id = p_target_user_id;

    -- Create wallet transaction (balance_after is set so trigger skips auto-update)
    INSERT INTO wallet_transactions (
      wallet_id, user_id, type, amount, balance_before, balance_after,
      reference_type, reference_id, description, metadata
    ) VALUES (
      v_wallet.id, p_target_user_id, 'adjustment', -p_amount, v_balance_before, v_balance_after,
      'admin_lock', v_admin_id, p_reason,
      json_build_object('admin_id', v_admin_id, 'action', 'lock', 'amount', p_amount, 'reason', p_reason)
    );

  ELSIF p_action = 'unlock' THEN
    -- Unlock: move amount from locked_balance back to balance
    IF p_amount IS NULL OR p_amount <= 0 THEN
      RETURN json_build_object('error', 'Amount must be positive for unlock action');
    END IF;
    IF p_amount > v_locked_before THEN
      RETURN json_build_object('error', 'Insufficient locked balance: cannot unlock more than locked balance');
    END IF;
    v_balance_after := v_balance_before + p_amount;
    v_locked_after := v_locked_before - p_amount;

    -- Update wallet
    UPDATE wallets SET
      balance = v_balance_after,
      locked_balance = v_locked_after,
      updated_at = now()
    WHERE user_id = p_target_user_id;

    -- Create wallet transaction
    INSERT INTO wallet_transactions (
      wallet_id, user_id, type, amount, balance_before, balance_after,
      reference_type, reference_id, description, metadata
    ) VALUES (
      v_wallet.id, p_target_user_id, 'adjustment', p_amount, v_balance_before, v_balance_after,
      'admin_unlock', v_admin_id, p_reason,
      json_build_object('admin_id', v_admin_id, 'action', 'unlock', 'amount', p_amount, 'reason', p_reason)
    );
  END IF;

  -- Create audit record (for all actions)
  INSERT INTO admin_wallet_actions (
    admin_id, target_user_id, wallet_id, action, amount, balance_before, balance_after, reason
  ) VALUES (
    v_admin_id, p_target_user_id, v_wallet.id, p_action, p_amount, v_balance_before, v_balance_after, p_reason
  );

  -- Create admin log (for all actions)
  INSERT INTO admin_logs (admin_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_admin_id, 'wallet_' || p_action, 'wallet', v_wallet.id,
    json_build_object('target_user_id', p_target_user_id, 'amount', p_amount, 'reason', p_reason)
  );

  -- Return updated wallet
  SELECT * INTO v_wallet FROM wallets WHERE user_id = p_target_user_id;
  RETURN json_build_object('wallet', row_to_json(v_wallet));
END;
$function$;
