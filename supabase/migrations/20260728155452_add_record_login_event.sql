-- =========================================================
-- record_login_event: updates last_login_at and creates audit log
-- Called from the frontend after successful sign-in
-- =========================================================
CREATE OR REPLACE FUNCTION public.record_login_event(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Update last_login_at on profile
  UPDATE profiles SET last_login_at = now(), updated_at = now()
  WHERE id = p_user_id;

  -- Create audit log entry
  INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    p_user_id,
    'user_login',
    'user',
    p_user_id,
    json_build_object('timestamp', now())
  );
END;
$function$;
