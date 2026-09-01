-- Update Coinflip (6% edge → 1.88x payout)

CREATE OR REPLACE FUNCTION play_coinflip_game(
  p_bet_amount numeric, p_choice text, p_client_seed text
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
  v_float numeric;
  v_outcome text;
  v_won boolean;
  v_multiplier numeric;
  v_payout numeric := 0;
  v_profit numeric;
  v_after numeric;
  v_session_id uuid;
BEGIN
IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
IF p_choice NOT IN ('heads', 'tails') THEN RAISE EXCEPTION 'Invalid choice'; END IF;

SELECT * INTO v_cfg FROM game_configs WHERE game_type = 'coinflip';
IF NOT FOUND THEN RAISE EXCEPTION 'Game not configured'; END IF;
IF p_bet_amount < v_cfg.min_bet OR p_bet_amount > v_cfg.max_bet THEN
  RAISE EXCEPTION 'Bet must be between % and %', v_cfg.min_bet, v_cfg.max_bet;
END IF;

v_debit := game_debit(v_user, p_bet_amount);
v_dev := (v_debit->>'dev')::boolean;

v_server_seed := encode(gen_random_bytes(32), 'hex');
v_seed_hash := encode(digest(v_server_seed, 'sha256'), 'hex');
SELECT COUNT(*)::int INTO v_nonce FROM game_sessions WHERE user_id = v_user;
v_hmac := hmac(v_server_seed, p_client_seed || ':' || v_nonce::text, 'sha256');
v_float := ((('x' || encode(substring(v_hmac, 1, 4), 'hex'))::bit(32)::bigint & x'7fffffff'::bigint) % 10000) / 10000.0;

v_outcome := CASE WHEN v_float < 0.5 THEN 'heads' ELSE 'tails' END;
v_won := (v_outcome = p_choice);
v_multiplier := 1.88;
IF v_won THEN
  v_payout := LEAST(ROUND(p_bet_amount * v_multiplier, 0), v_cfg.max_payout);
END IF;
v_profit := v_payout - p_bet_amount;

INSERT INTO game_sessions (user_id, game_type, status, bet_amount, payout, profit,
client_seed, server_seed_hash, server_seed, nonce, config, result, started_at, ended_at)
VALUES (v_user, 'coinflip', 'completed', p_bet_amount, v_payout, v_profit,
p_client_seed, v_seed_hash, v_server_seed, v_nonce,
jsonb_build_object('choice', p_choice, 'dev_mode', v_dev),
jsonb_build_object('outcome', v_outcome, 'won', v_won, 'multiplier', v_multiplier, 'float', v_float),
now(), now())
RETURNING id INTO v_session_id;

INSERT INTO provably_fair (session_id, user_id, game_type, server_seed, server_seed_hash, client_seed, nonce, hmac, revealed_at)
VALUES (v_session_id, v_user, 'coinflip', v_server_seed, v_seed_hash, p_client_seed, v_nonce, encode(v_hmac, 'hex'), now());

PERFORM game_tx(v_user, 'bet', -p_bet_amount, (v_debit->>'before')::numeric, (v_debit->>'after')::numeric, v_session_id, 'Coinflip bet', v_dev);
v_after := game_credit(v_user, v_payout, v_profit, v_dev);
IF v_payout > 0 THEN
  PERFORM game_tx(v_user, 'win', v_payout, v_after - v_payout, v_after, v_session_id, 'Coinflip win', v_dev);
END IF;

RETURN jsonb_build_object(
  'session_id', v_session_id, 'outcome', v_outcome, 'won', v_won,
  'payout', v_payout, 'profit', v_profit, 'multiplier', v_multiplier,
  'server_seed', v_server_seed, 'server_seed_hash', v_seed_hash,
  'client_seed', p_client_seed, 'nonce', v_nonce, 'new_balance', v_after, 'dev_mode', v_dev
);
END;
$$;
