/*
# Fix generate_link_code: schema-qualify gen_random_bytes

## Problem
Supabase installs pgcrypto under the `extensions` schema, not `public`.
The generate_link_code function had `SET search_path = public` which
excluded the extensions schema, causing:
  "function gen_random_bytes(integer) does not exist"

## Fix
- Update search_path to `public, extensions`
- Schema-qualify the call as `extensions.gen_random_bytes(6)` for belt-and-suspenders safety
*/

CREATE OR REPLACE FUNCTION generate_link_code(p_minecraft_ign text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
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
  v_code := upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 6));

  INSERT INTO minecraft_link_codes (user_id, code, minecraft_ign, expires_at)
  VALUES (v_user, v_code, trim(p_minecraft_ign), now() + interval '10 minutes');

  RETURN v_code;
END;
$$;

REVOKE EXECUTE ON FUNCTION generate_link_code FROM anon;
GRANT EXECUTE ON FUNCTION generate_link_code TO authenticated;
