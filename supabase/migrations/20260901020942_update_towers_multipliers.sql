-- Update Towers multipliers for higher house edge (8-10%)

CREATE OR REPLACE FUNCTION start_towers_game(
  p_bet_amount numeric, p_difficulty text, p_client_seed text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public', 'extensions'
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
  v_cols int;
  v_bombs_per int;
  v_mults numeric[];
  v_bombs jsonb := '[]'::jsonb;
  v_level int;
  v_f numeric;
  v_b1 int;
  v_b2 int;
  v_session_id uuid;
  v_existing uuid;
BEGIN
IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

SELECT id INTO v_existing FROM game_sessions
WHERE user_id = v_user AND game_type = 'towers' AND status = 'active' LIMIT 1;
IF v_existing IS NOT NULL THEN RAISE EXCEPTION 'You already have an active Towers game'; END IF;

IF p_difficulty = 'easy' THEN
  v_cols := 3; v_bombs_per := 1;
  v_mults := ARRAY[1.25, 1.56, 1.95, 2.44, 3.05, 3.81, 4.77, 5.96];
ELSIF p_difficulty = 'normal' THEN
  v_cols := 2; v_bombs_per := 1;
  v_mults := ARRAY[1.47, 2.16, 3.17, 4.66, 6.84, 10.04, 14.73, 21.62];
ELSIF p_difficulty = 'hard' THEN
  v_cols := 3; v_bombs_per := 2;
  v_mults := ARRAY[1.77, 3.14, 5.57, 9.88, 17.52, 31.05, 55.04, 97.59];
ELSE
  RAISE EXCEPTION 'Invalid difficulty';
END IF;

SELECT * INTO v_cfg FROM game_configs WHERE game_type = 'towers';
IF NOT FOUND THEN RAISE EXCEPTION 'Game not configured'; END IF;
IF p_bet_amount < v_cfg.min_bet OR p_bet_amount > v_cfg.max_bet THEN
  RAISE EXCEPTION 'Bet must be between % and %', v_cfg.min_bet, v_cfg.max_bet;
END IF;

v_debit := game_debit(v_user, p_bet_amount);
v_dev := (v_debit->>'dev')::boolean;

v_server_seed := encode(gen_random_bytes(32), 'hex');
v_seed_hash := encode(digest(v_server_seed, 'sha256'), 'hex');
SELECT COUNT(*)::int INTO v_nonce FROM game_sessions WHERE user_id = v_user;

FOR v_level IN 0..7 LOOP
  v_hmac := hmac(v_server_seed, p_client_seed || ':' || v_nonce::text || ':' || v_level::text, 'sha256');
  v_f := ((('x' || encode(substring(v_hmac, 1, 4), 'hex'))::bit(32)::bigint & x'7fffffff'::bigint) % 10000) / 10000.0;
  v_b1 := floor(v_f * v_cols)::int;
  IF v_b1 >= v_cols THEN v_b1 := v_cols - 1; END IF;
  IF v_bombs_per = 1 THEN
    v_bombs := v_bombs || jsonb_build_array(jsonb_build_array(v_b1));
  ELSE
    v_f := ((('x' || encode(substring(v_hmac, 5, 4), 'hex'))::bit(32)::bigint & x'7fffffff'::bigint) % 10000) / 10000.0;
    v_b2 := floor(v_f * (v_cols - 1))::int;
    IF v_b2 >= v_cols - 1 THEN v_b2 := v_cols - 2; END IF;
    IF v_b2 >= v_b1 THEN v_b2 := v_b2 + 1; END IF;
    v_bombs := v_bombs || jsonb_build_array(jsonb_build_array(v_b1, v_b2));
  END IF;
END LOOP;

INSERT INTO game_sessions (user_id, game_type, status, bet_amount, payout, profit,
client_seed, server_seed_hash, nonce, config, result, started_at)
VALUES (v_user, 'towers', 'active', p_bet_amount, 0, -p_bet_amount,
p_client_seed, v_seed_hash, v_nonce,
jsonb_build_object('difficulty', p_difficulty, 'columns', v_cols, 'bombs_per_level', v_bombs_per,
'multipliers', to_jsonb(v_mults), 'dev_mode', v_dev),
jsonb_build_object('level', 0, 'picks', '[]'::jsonb, 'current_multiplier', 0),
now())
RETURNING id INTO v_session_id;

INSERT INTO game_secrets (session_id, server_seed, data)
VALUES (v_session_id, v_server_seed, jsonb_build_object('bombs', v_bombs));

PERFORM game_tx(v_user, 'bet', -p_bet_amount, (v_debit->>'before')::numeric, (v_debit->>'after')::numeric, v_session_id, 'Towers bet', v_dev);

RETURN jsonb_build_object(
  'session_id', v_session_id, 'server_seed_hash', v_seed_hash,
  'client_seed', p_client_seed, 'nonce', v_nonce,
  'columns', v_cols, 'multipliers', to_jsonb(v_mults),
  'new_balance', (v_debit->>'after')::numeric, 'dev_mode', v_dev
);
END;
$$;
