-- =========================================================
-- Fix is_admin() to check profiles table instead of JWT
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
SELECT EXISTS (
  SELECT 1 FROM profiles
  WHERE id = auth.uid() AND role = 'admin'
);
$function$;

-- =========================================================
-- Fix admin_search_users: status filter enum cast bug
-- =========================================================
CREATE OR REPLACE FUNCTION public.admin_search_users(
  p_query text DEFAULT '',
  p_role text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
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
  AND (p_role IS NULL OR p.role = p_role::user_role)
  AND (p_status IS NULL OR p.status = p_status::account_status);

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
    AND (p_role IS NULL OR p.role = p_role::user_role)
    AND (p_status IS NULL OR p.status = p_status::account_status)
    ORDER BY p.created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) t;

  RETURN json_build_object('items', v_items, 'count', v_count);
END;
$function$;

-- =========================================================
-- Fix admin_adjust_wallet: avoid double-update from trigger
-- The update_wallet_balance_from_tx trigger fires on wallet_transactions
-- INSERT and updates the wallet balance. But admin_adjust_wallet
-- already updates the wallet directly. To avoid double-update, we
-- set balance_before/balance_after on the transaction row BEFORE
-- insert so the trigger sees them already set and skips its own
-- balance calculation. We modify the trigger to skip if balance_after
-- is already set.
-- =========================================================
CREATE OR REPLACE FUNCTION public.update_wallet_balance_from_tx()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_balance numeric(18,2);
  new_balance numeric(18,2);
  wallet_rec RECORD;
BEGIN
  -- If balance_after is already set (e.g. by admin_adjust_wallet), skip the auto-update
  IF NEW.balance_after IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT balance, total_wagered, lifetime_pnl INTO wallet_rec
  FROM wallets WHERE id = NEW.wallet_id FOR UPDATE;

  current_balance := wallet_rec.balance;
  new_balance := current_balance + NEW.amount;

  IF new_balance < 0 THEN
    RAISE EXCEPTION 'Insufficient balance: cannot apply % to balance %', NEW.amount, current_balance;
  END IF;

  NEW.balance_before := current_balance;
  NEW.balance_after := new_balance;

  UPDATE wallets SET
    balance = new_balance,
    total_wagered = CASE WHEN NEW.type = 'bet' THEN total_wagered + ABS(NEW.amount) ELSE total_wagered END,
    lifetime_pnl = CASE
      WHEN NEW.type = 'bet' THEN lifetime_pnl + NEW.amount
      WHEN NEW.type = 'win' THEN lifetime_pnl + NEW.amount
      ELSE lifetime_pnl
    END,
    updated_at = now()
  WHERE id = NEW.wallet_id;

  RETURN NEW;
END;
$function$;

-- =========================================================
-- Add admin RLS policies for wallets and wallet_transactions
-- so admins can read ALL wallets/transactions (not just their own)
-- =========================================================

-- Wallets: admin can read all
CREATE POLICY "wallets_select_admin"
  ON wallets FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

-- Wallet transactions: admin can read all
CREATE POLICY "wallet_tx_select_admin"
  ON wallet_transactions FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

-- Game sessions: admin can read all
CREATE POLICY "game_sessions_select_admin"
  ON game_sessions FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

-- =========================================================
-- Add audit logging to handle_new_user trigger (registration)
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  base_username text;
  unique_username text;
  suffix int := 0;
BEGIN
  base_username := coalesce(
    new.raw_user_meta_data ->> 'username',
    split_part(new.email, '@', 1)
  );
  unique_username := base_username;
  WHILE EXISTS (SELECT 1 FROM profiles WHERE username = unique_username) LOOP
    suffix := suffix + 1;
    unique_username := base_username || '_' || suffix::text;
  END LOOP;

  INSERT INTO public.profiles (id, username, display_name, avatar_url, last_login_at)
  VALUES (
    new.id,
    unique_username,
    coalesce(new.raw_user_meta_data ->> 'display_name', unique_username),
    new.raw_user_meta_data ->> 'avatar_url',
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Audit log: new user registration
  INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    new.id,
    'user_registered',
    'user',
    new.id,
    json_build_object('email', new.email, 'username', unique_username)
  );

  RETURN new;
END;
$function$;

-- =========================================================
-- Add audit logging trigger for game_configs UPDATE
-- =========================================================
CREATE OR REPLACE FUNCTION public.audit_game_config_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    'game_config_updated',
    'game_config',
    NEW.id,
    json_build_object(
      'game_type', NEW.game_type,
      'old_values', to_jsonb(OLD),
      'new_values', to_jsonb(NEW)
    )
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_audit_game_config ON game_configs;
CREATE TRIGGER trg_audit_game_config
  AFTER UPDATE ON game_configs
  FOR EACH ROW
  EXECUTE FUNCTION audit_game_config_change();

-- =========================================================
-- Add audit logging trigger for profiles role/status changes
-- =========================================================
CREATE OR REPLACE FUNCTION public.audit_profile_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only log if role or status changed
  IF OLD.role <> NEW.role OR OLD.status <> NEW.status THEN
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata)
    VALUES (
      auth.uid(),
      CASE
        WHEN OLD.role <> NEW.role THEN 'role_changed'
        ELSE 'status_changed'
      END,
      'profile',
      NEW.id,
      json_build_object(
        'old_role', OLD.role,
        'new_role', NEW.role,
        'old_status', OLD.status,
        'new_status', NEW.status
      )
    );
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_audit_profile ON profiles;
CREATE TRIGGER trg_audit_profile
  AFTER UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION audit_profile_change();
