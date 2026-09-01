/*
# Fix minecraft_get_pending_withdrawals ORDER BY

The previous version used ORDER BY inside jsonb_agg which conflicts with
GROUP BY semantics. Move the ordering into a subquery instead.
*/

CREATE OR REPLACE FUNCTION minecraft_get_pending_withdrawals()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_results jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_results
  FROM (
    SELECT
      wt.id AS transfer_id,
      wt.user_id,
      wt.minecraft_uuid,
      wt.amount,
      wt.idempotency_key,
      wt.created_at
    FROM wallet_transfers wt
    WHERE wt.direction = 'web_to_minecraft'
      AND wt.status = 'pending'
    ORDER BY wt.created_at ASC
    LIMIT 50
  ) t;

  RETURN v_results;
END;
$$;
