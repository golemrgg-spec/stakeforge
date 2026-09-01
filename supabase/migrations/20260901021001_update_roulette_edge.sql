-- Update Roulette (46.6667% / 46.6667% / 6.6667% = 6.67% house edge)

CREATE OR REPLACE FUNCTION play_roulette_game(
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
  v_roll int;
  v_color text;
  v_payout numeric;
  v_profit numeric;
  v_after numeric;
  v_session_id uuid;
BEGIN
IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
IF p_choice NOT IN ('red', 'purple', 'yellow') THEN
  RAISE EXCEPTION 'Invalid color choice';
END IF;

SELECT * INTO v_cfg FROM game_configs WHERE game_type = 'roulette';
IF NOT FOUND THEN RAISE EXCEPTION 'Game not configured'; END IF;
IF p_bet_amount < v_cfg.min_bet OR p_bet_amount > v_cfg.max_bet THEN
  RAISE EXCEPTION 'Bet must be between % and %', v_cfg.min_bet, v_cfg.max_bet;
END IF;

v_debit := game_debit(v_user, p_bet_amount);
v_dev := (v_debit->>'dev')::boolean;

v_server_seed := encode(gen_random_bytes(32), 'hex');
v_seed_hash := encode(digest(v_server_seed, 'sha256'), 'hex');
SELECT COUNT(*)::int INTO v_nonce FROM game_sessions WHERE user_id = v_user;

-- Roll: 0-999999 (millionths)
-- 0-466666 = red (46.6667%), 466667-933333 = purple (46.6667%), 933334-999999 = yellow (6.6667%)
v_hmac := hmac(v_server_seed, p_client_seed || ':' || v_nonce::text, 'sha256');
v_roll := ((('x' || encode(substring(v_hmac, 1, 4), 'hex'))::bit(32)::bigint & x'7fffffff'::bigint) % 1000000)::int;

IF v_roll < 466667 THEN
  v_color := 'red';
ELSIF v_roll < 933334 THEN
  v_color := 'purple';
ELSE
  v_color := 'yellow';
END IF;

IF v_color = p_choice THEN
  v_payout := CASE
    WHEN p_choice = 'yellow' THEN ROUND(p_bet_amount * 14, 0)
    ELSE ROUND(p_bet_amount * 2, 0)
  END;
  v_payout := LEAST(v_payout, v_cfg.max_payout);
ELSE
  v_payout := 0;
END IF;

v_profit := v_payout - p_bet_amount;

INSERT INTO game_sessions (
  user_id, game_type, status, bet_amount, payout, profit,
  client_seed, server_seed_hash, server_seed, nonce,
  config, result, started_at, ended_at
)
VALUES (
  v_user, 'roulette', 'completed', p_bet_amount, v_payout, v_profit,
  p_client_seed, v_seed_hash, v_server_seed, v_nonce,
  jsonb_build_object('choice', p_choice, 'dev_mode', v_dev),
  jsonb_build_object('roll', v_roll, 'color', v_color, 'won', v_color = p_choice),
  now(), now()
)
RETURNING id INTO v_session_id;

INSERT INTO provably_fair (
  session_id, user_id, game_type,
  server_seed, server_seed_hash, client_seed, nonce, hmac, revealed_at
)
VALUES (
  v_session_id, v_user, 'roulette',
  v_server_seed, v_seed_hash, p_client_seed, v_nonce,
  encode(v_hmac, 'hex'), now()
);

PERFORM game_tx(v_user, 'bet', -p_bet_amount, (v_debit->>'before')::numeric, (v_debit->>'after')::numeric, v_session_id, 'Roulette bet', v_dev);
v_after := game_credit(v_user, v_payout, v_profit, v_dev);
IF v_payout > 0 THEN
  PERFORM game_tx(v_user, 'win', v_payout, v_after - v_payout, v_after, v_session_id, 'Roulette win', v_dev);
END IF;

RETURN jsonb_build_object(
  'session_id', v_session_id, 'roll', v_roll, 'color', v_color,
  'won', v_color = p_choice, 'payout', v_payout, 'profit', v_profit,
  'server_seed', v_server_seed, 'server_seed_hash', v_seed_hash,
  'client_seed', p_client_seed, 'nonce', v_nonce,
  'new_balance', v_after, 'dev_mode', v_dev
);
END;
$$;
