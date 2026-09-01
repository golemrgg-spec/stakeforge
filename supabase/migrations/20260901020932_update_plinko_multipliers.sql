-- Update Plinko multipliers for higher house edge (8-10%)

CREATE OR REPLACE FUNCTION play_plinko_game(
  p_bet_amount numeric, p_risk text, p_client_seed text
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
  v_mults numeric[];
  v_rows int;
  v_pos int := 0;
  v_path int[] := '{}';
  v_bit int;
  v_i int;
  v_multiplier numeric;
  v_payout numeric;
  v_profit numeric;
  v_after numeric;
  v_session_id uuid;
BEGIN
IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

IF p_risk = 'easy' THEN
  v_mults := ARRAY[4.0, 2.0, 1.1, 0.5, 0.3, 0.5, 1.1, 2.0, 4.0];
ELSIF p_risk = 'normal' THEN
  v_mults := ARRAY[10.0, 3.0, 1.5, 1.0, 0.5, 0.3, 0.5, 1.0, 1.5, 3.0, 10.0];
ELSIF p_risk = 'hard' THEN
  v_mults := ARRAY[29.0, 5.0, 2.0, 0.5, 0.2, 0.1, 0.2, 0.5, 2.0, 5.0, 29.0];
ELSE
  RAISE EXCEPTION 'Invalid risk';
END IF;
v_rows := array_length(v_mults, 1) - 1;

SELECT * INTO v_cfg FROM game_configs WHERE game_type = 'plinko';
IF NOT FOUND THEN RAISE EXCEPTION 'Game not configured'; END IF;
IF p_bet_amount < v_cfg.min_bet OR p_bet_amount > v_cfg.max_bet THEN
  RAISE EXCEPTION 'Bet must be between % and %', v_cfg.min_bet, v_cfg.max_bet;
END IF;

v_debit := game_debit(v_user, p_bet_amount);
v_dev := (v_debit->>'dev')::boolean;

v_server_seed := encode(gen_random_bytes(32), 'hex');
v_seed_hash := encode(digest(v_server_seed, 'sha256'), 'hex');
SELECT COUNT(*)::int INTO v_nonce FROM game_sessions WHERE user_id = v_user;

FOR v_i IN 0..(v_rows - 1) LOOP
  v_hmac := hmac(v_server_seed, p_client_seed || ':' || v_nonce::text || ':' || v_i::text, 'sha256');
  v_bit := CASE WHEN ((('x' || encode(substring(v_hmac, 1, 4), 'hex'))::bit(32)::bigint & x'7fffffff'::bigint) % 10000) < 5000 THEN 0 ELSE 1 END;
  v_pos := v_pos + v_bit;
  v_path := v_path || v_bit;
END LOOP;

v_multiplier := v_mults[v_pos + 1];
v_payout := LEAST(ROUND(p_bet_amount * v_multiplier, 0), v_cfg.max_payout);
v_profit := v_payout - p_bet_amount;

INSERT INTO game_sessions (user_id, game_type, status, bet_amount, payout, profit,
client_seed, server_seed_hash, server_seed, nonce, config, result, started_at, ended_at)
VALUES (v_user, 'plinko', 'completed', p_bet_amount, v_payout, v_profit,
p_client_seed, v_seed_hash, v_server_seed, v_nonce,
jsonb_build_object('risk', p_risk, 'dev_mode', v_dev),
jsonb_build_object('slot', v_pos, 'path', to_jsonb(v_path), 'multiplier', v_multiplier),
now(), now())
RETURNING id INTO v_session_id;

INSERT INTO provably_fair (session_id, user_id, game_type, server_seed, server_seed_hash, client_seed, nonce, hmac, revealed_at)
VALUES (v_session_id, v_user, 'plinko', v_server_seed, v_seed_hash, p_client_seed, v_nonce,
encode(hmac(v_server_seed, p_client_seed || ':' || v_nonce::text, 'sha256'), 'hex'), now());

PERFORM game_tx(v_user, 'bet', -p_bet_amount, (v_debit->>'before')::numeric, (v_debit->>'after')::numeric, v_session_id, 'Plinko bet', v_dev);
v_after := game_credit(v_user, v_payout, v_profit, v_dev);
IF v_payout > 0 THEN
  PERFORM game_tx(v_user, 'win', v_payout, v_after - v_payout, v_after, v_session_id, 'Plinko win', v_dev);
END IF;

RETURN jsonb_build_object(
  'session_id', v_session_id, 'slot', v_pos, 'path', to_jsonb(v_path),
  'multiplier', v_multiplier, 'payout', v_payout, 'profit', v_profit,
  'server_seed', v_server_seed, 'server_seed_hash', v_seed_hash,
  'client_seed', p_client_seed, 'nonce', v_nonce, 'new_balance', v_after, 'dev_mode', v_dev
);
END;
$$;
