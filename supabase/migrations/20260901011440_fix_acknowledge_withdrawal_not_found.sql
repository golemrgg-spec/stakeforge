/*
# Fix minecraft_acknowledge_withdrawal not_found handling

When the transfer doesn't exist at all, the previous version tried to
return 'not_found' as a transfer_status enum value, which caused an error.
Fix: return 'not_found' as a plain text field in the JSON response.
*/

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
  v_current_status text;
BEGIN
  -- Atomic claim: lock the transfer
  SELECT * INTO v_transfer
  FROM wallet_transfers
  WHERE id = p_transfer_id
    AND idempotency_key = p_idempotency_key
    AND status = 'pending'
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    -- Check if it exists at all (already processed or doesn't exist)
    SELECT status::text INTO v_current_status
    FROM wallet_transfers WHERE id = p_transfer_id AND idempotency_key = p_idempotency_key;

    IF v_current_status IS NULL THEN
      RETURN jsonb_build_object('status', 'not_found', 'duplicate', false);
    END IF;

    -- Already processed
    RETURN jsonb_build_object('status', v_current_status, 'duplicate', true);
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
