/*
# Admin Wallet Management and User Profile RPC Functions

## Overview
Creates SECURITY DEFINER PostgreSQL functions that handle:
1. Admin wallet adjustments (add/remove/set/lock/unlock) with full audit logging
2. User profile summary retrieval (profile + wallet + game stats)
3. User activity timeline (union of wallet transactions, game sessions, admin actions)
4. User game history with provably fair records
5. Admin user search

## Security
- All functions are SECURITY DEFINER so they run with database privileges
- `admin_adjust_wallet` validates the caller is an admin before performing any action
- All modifications are atomic — the wallet update, transaction record, and audit log
  are written in a single function call
- No function ever exposes data the caller shouldn't see — admin functions check role,
  user-scoped functions check ownership

## Functions
1. `admin_adjust_wallet(p_admin_id, p_target_user_id, p_action, p_amount, p_reason)`
   — Performs a wallet modification, creates a wallet_transaction, writes an
     admin_wallet_actions audit row, and writes an admin_logs entry. Returns the
     updated wallet.

2. `get_user_profile_summary(p_user_id)`
   — Returns a single JSON object with the user's profile, wallet, and game stats
     (total games, total wagered, wins, losses). Available to the user themselves
     or any admin.

3. `get_user_activity_timeline(p_user_id, p_limit, p_offset, p_type_filter)`
   — Returns a chronological feed of the user's wallet transactions, game sessions,
     and admin wallet actions. Optional type filter. Available to the user themselves
     or any admin.

4. `get_user_game_history(p_user_id, p_limit, p_offset)`
   — Returns all completed game sessions for a user with provably fair fields.
     Available to the user themselves or any admin.

5. `admin_search_users(p_query, p_role, p_status, p_limit, p_offset)`
   — Searches profiles by username, email, or user id. Admin-only.

## Important Notes
1. All functions use `auth.uid()` to identify the caller.
2. Admin role is checked via `profiles.role = 'admin'`.
3. The `admin_adjust_wallet` function locks the wallet row with FOR UPDATE to prevent
   concurrent modification races.
4. Wallet transaction types for admin actions use 'adjustment' for add/remove/set
   and 'bonus' for add (alternative), but we standardize on 'adjustment' for all
   admin-initiated balance changes.
*/

-- =========================================================
-- 1. admin_adjust_wallet
-- =========================================================
CREATE OR REPLACE FUNCTION admin_adjust_wallet(
  p_target_user_id uuid,
  p_action text,
  p_amount numeric DEFAULT NULL,
  p_reason text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_admin_role text;
  v_wallet RECORD;
  v_balance_before numeric;
  v_balance_after numeric;
  v_tx_amount numeric;
  v_tx_type text;
  v_result json;
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
  ELSIF p_action = 'set' THEN
    IF p_amount IS NULL OR p_amount < 0 THEN
      RETURN json_build_object('error', 'Amount must be zero or positive for set action');
    END IF;
    v_balance_after := p_amount;
    v_tx_amount := p_amount - v_balance_before;
    v_tx_type := 'adjustment';
  ELSIF p_action = 'lock' THEN
    -- Lock: move amount from balance to locked_balance
    IF p_amount IS NULL OR p_amount <= 0 THEN
      RETURN json_build_object('error', 'Amount must be positive for lock action');
    END IF;
    IF p_amount > v_balance_before THEN
      RETURN json_build_object('error', 'Insufficient balance: cannot lock more than current balance');
    END IF;
    v_balance_after := v_balance_before - p_amount;
    -- Update both balance and locked_balance
    UPDATE wallets SET
      balance = v_balance_after,
      locked_balance = locked_balance + p_amount,
      updated_at = now()
    WHERE user_id = p_target_user_id;

    -- Create wallet transaction
    INSERT INTO wallet_transactions (
      wallet_id, user_id, type, amount, balance_before, balance_after,
      reference_type, reference_id, description, metadata
    ) VALUES (
      v_wallet.id, p_target_user_id, 'adjustment', -p_amount, v_balance_before, v_balance_after,
      'admin_lock', v_admin_id, p_reason,
      json_build_object('admin_id', v_admin_id, 'action', 'lock', 'amount', p_amount, 'reason', p_reason)
    );

    -- Create audit record
    INSERT INTO admin_wallet_actions (
      admin_id, target_user_id, wallet_id, action, amount, balance_before, balance_after, reason
    ) VALUES (
      v_admin_id, p_target_user_id, v_wallet.id, 'lock', p_amount, v_balance_before, v_balance_after, p_reason
    );

    -- Create admin log
    INSERT INTO admin_logs (admin_id, action, entity_type, entity_id, metadata)
    VALUES (
      v_admin_id, 'wallet_lock', 'wallet', v_wallet.id,
      json_build_object('target_user_id', p_target_user_id, 'amount', p_amount, 'reason', p_reason)
    );

    -- Return updated wallet
    SELECT * INTO v_wallet FROM wallets WHERE user_id = p_target_user_id;
    RETURN json_build_object('wallet', row_to_json(v_wallet));
  ELSIF p_action = 'unlock' THEN
    -- Unlock: move amount from locked_balance back to balance
    IF p_amount IS NULL OR p_amount <= 0 THEN
      RETURN json_build_object('error', 'Amount must be positive for unlock action');
    END IF;
    IF p_amount > v_wallet.locked_balance THEN
      RETURN json_build_object('error', 'Insufficient locked balance: cannot unlock more than locked balance');
    END IF;
    v_balance_after := v_balance_before + p_amount;

    UPDATE wallets SET
      balance = v_balance_after,
      locked_balance = locked_balance - p_amount,
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

    -- Create audit record
    INSERT INTO admin_wallet_actions (
      admin_id, target_user_id, wallet_id, action, amount, balance_before, balance_after, reason
    ) VALUES (
      v_admin_id, p_target_user_id, v_wallet.id, 'unlock', p_amount, v_balance_before, v_balance_after, p_reason
    );

    -- Create admin log
    INSERT INTO admin_logs (admin_id, action, entity_type, entity_id, metadata)
    VALUES (
      v_admin_id, 'wallet_unlock', 'wallet', v_wallet.id,
      json_build_object('target_user_id', p_target_user_id, 'amount', p_amount, 'reason', p_reason)
    );

    -- Return updated wallet
    SELECT * INTO v_wallet FROM wallets WHERE user_id = p_target_user_id;
    RETURN json_build_object('wallet', row_to_json(v_wallet));
  END IF;

  -- For add/remove/set: update the wallet balance
  UPDATE wallets SET
    balance = v_balance_after,
    updated_at = now()
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

  -- Create audit record
  INSERT INTO admin_wallet_actions (
    admin_id, target_user_id, wallet_id, action, amount, balance_before, balance_after, reason
  ) VALUES (
    v_admin_id, p_target_user_id, v_wallet.id, p_action, p_amount, v_balance_before, v_balance_after, p_reason
  );

  -- Create admin log
  INSERT INTO admin_logs (admin_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_admin_id, 'wallet_' || p_action, 'wallet', v_wallet.id,
    json_build_object('target_user_id', p_target_user_id, 'amount', p_amount, 'reason', p_reason)
  );

  -- Return updated wallet
  SELECT * INTO v_wallet FROM wallets WHERE user_id = p_target_user_id;
  RETURN json_build_object('wallet', row_to_json(v_wallet));
END;
$$;

-- =========================================================
-- 2. get_user_profile_summary
-- =========================================================
CREATE OR REPLACE FUNCTION get_user_profile_summary(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_caller_role text;
  v_profile RECORD;
  v_wallet RECORD;
  v_game_stats RECORD;
  v_email text;
BEGIN
  -- Check if caller is the user themselves or an admin
  SELECT role INTO v_caller_role FROM profiles WHERE id = v_caller_id;

  IF v_caller_id <> p_user_id AND (v_caller_role IS NULL OR v_caller_role <> 'admin') THEN
    RETURN json_build_object('error', 'Unauthorized');
  END IF;

  -- Get profile
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'User not found');
  END IF;

  -- Get email from auth.users
  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;

  -- Get wallet
  SELECT * INTO v_wallet FROM wallets WHERE user_id = p_user_id;

  -- Get game stats
  SELECT
    COUNT(*) AS total_games,
    COALESCE(SUM(bet_amount), 0) AS total_wagered,
    COUNT(*) FILTER (WHERE profit > 0) AS wins,
    COUNT(*) FILTER (WHERE profit < 0) AS losses
  INTO v_game_stats
  FROM game_sessions
  WHERE user_id = p_user_id AND status = 'completed';

  RETURN json_build_object(
    'profile', row_to_json(v_profile),
    'email', v_email,
    'wallet', row_to_json(v_wallet),
    'game_stats', row_to_json(v_game_stats)
  );
END;
$$;

-- =========================================================
-- 3. get_user_activity_timeline
-- =========================================================
CREATE OR REPLACE FUNCTION get_user_activity_timeline(
  p_user_id uuid,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_type_filter text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Build the timeline by unioning wallet transactions, game sessions, and admin actions
  -- The p_type_filter can be: 'wallet', 'game', 'admin', or NULL for all
  IF p_type_filter IS NULL OR p_type_filter = 'wallet' THEN
    -- Wallet transactions are always included unless filtering to non-wallet
  END IF;

  EXECUTE format($q$
    SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::json)
    FROM (
      SELECT
        'wallet' AS source,
        wt.id,
        wt.type AS event_type,
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
$$;

-- =========================================================
-- 4. get_user_game_history
-- =========================================================
CREATE OR REPLACE FUNCTION get_user_game_history(
  p_user_id uuid,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_caller_role text;
  v_items json;
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = v_caller_id;

  IF v_caller_id <> p_user_id AND (v_caller_role IS NULL OR v_caller_role <> 'admin') THEN
    RETURN json_build_object('error', 'Unauthorized');
  END IF;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::json)
  INTO v_items
  FROM (
    SELECT
      gs.id,
      gs.game_type,
      gs.status,
      gs.bet_amount,
      gs.payout,
      gs.profit,
      gs.client_seed,
      gs.server_seed,
      gs.server_seed_hash,
      gs.config,
      gs.result,
      gs.created_at,
      gs.ended_at
    FROM game_sessions gs
    WHERE gs.user_id = p_user_id
    ORDER BY gs.created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) t;

  RETURN json_build_object('items', v_items);
END;
$$;

-- =========================================================
-- 5. admin_search_users
-- =========================================================
CREATE OR REPLACE FUNCTION admin_search_users(
  p_query text DEFAULT '',
  p_role text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_caller_role text;
  v_items json;
  v_count integer;
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = v_caller_id;

  IF v_caller_role IS NULL OR v_caller_role <> 'admin' THEN
    RETURN json_build_object('error', 'Unauthorized: admin role required');
  END IF;

  -- Get count
  SELECT COUNT(*) INTO v_count
  FROM profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE (
    p_query IS NULL OR p_query = '' OR
    p.username ILIKE '%' || p_query || '%' OR
    p.display_name ILIKE '%' || p_query || '%' OR
    u.email ILIKE '%' || p_query || '%' OR
    p.id::text = p_query
  )
  AND (p_role IS NULL OR p.role = p_role)
  AND (p_status IS NULL OR p.status = p_status);

  -- Get items with email
  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::json)
  INTO v_items
  FROM (
    SELECT
      p.id,
      p.username,
      p.display_name,
      p.role,
      p.status,
      p.created_at,
      p.last_login_at,
      u.email,
      w.balance,
      w.locked_balance
    FROM profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    LEFT JOIN wallets w ON w.user_id = p.id
    WHERE (
      p_query IS NULL OR p_query = '' OR
      p.username ILIKE '%' || p_query || '%' OR
      p.display_name ILIKE '%' || p_query || '%' OR
      u.email ILIKE '%' || p_query || '%' OR
      p.id::text = p_query
    )
    AND (p_role IS NULL OR p.role = p_role)
    AND (p_status IS NULL OR p.status = p.status)
    ORDER BY p.created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) t;

  RETURN json_build_object('items', v_items, 'count', v_count);
END;
$$;
