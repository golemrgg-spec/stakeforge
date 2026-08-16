-- =========================================================
-- Fix get_user_activity_timeline: UNION type mismatch
-- The first SELECT returned wt.type (wallet_tx_type enum) as event_type,
-- but the other SELECTs returned text. PostgreSQL can't UNION enum with text.
-- Fix: cast wt.type to text explicitly.
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_user_activity_timeline(
  p_user_id uuid,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_type_filter text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_id uuid := auth.uid();
  v_caller_role text;
  v_items json;
BEGIN
  -- Check if caller is the user themselves or an admin
  SELECT role INTO v_caller_role FROM profiles WHERE id = v_caller_id;

  IF v_caller_id <> p_user_id AND (v_caller_role IS NULL OR v_caller_role <> 'admin') THEN
    RETURN json_build_object('error', 'Unauthorized');
  END IF;

  EXECUTE format($q$
  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::json)
  FROM (
    SELECT
      'wallet' AS source,
      wt.id,
      wt.type::text AS event_type,
      wt.amount,
      wt.balance_before,
      wt.balance_after,
      wt.reference_type,
      wt.description,
      wt.metadata,
      wt.created_at
    FROM wallet_transactions wt
    WHERE wt.user_id = $1
    AND ($4 IS NULL OR $4 = 'wallet')

    UNION ALL

    SELECT
      'game' AS source,
      gs.id,
      gs.game_type AS event_type,
      gs.bet_amount AS amount,
      NULL::numeric AS balance_before,
      NULL::numeric AS balance_after,
      gs.status::text AS reference_type,
      NULL::text AS description,
      gs.result AS metadata,
      COALESCE(gs.ended_at, gs.created_at) AS created_at
    FROM game_sessions gs
    WHERE gs.user_id = $1
    AND ($4 IS NULL OR $4 = 'game')

    UNION ALL

    SELECT
      'admin' AS source,
      awa.id,
      awa.action AS event_type,
      awa.amount,
      awa.balance_before,
      awa.balance_after,
      NULL::text AS reference_type,
      awa.reason AS description,
      json_build_object('admin_id', awa.admin_id) AS metadata,
      awa.created_at
    FROM admin_wallet_actions awa
    WHERE awa.target_user_id = $1
    AND ($4 IS NULL OR $4 = 'admin')

    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
  ) t
  $q$)
  USING p_user_id, p_limit, p_offset, p_type_filter
  INTO v_items;

  RETURN json_build_object('items', v_items);
END;
$function$;
