-- Fix: blackjack_deal must include 'actions': '[]' in each hand object.
-- Without it, blackjack_action's jsonb_set(..., (v_hand->'actions') || '"hit"')
-- gets SQL NULL on the left of ||, which makes jsonb_set return NULL,
-- nullifying v_hands → jsonb_array_length(NULL) → FOR loop upper bound is NULL.

CREATE OR REPLACE FUNCTION blackjack_deal(
  p_bet_amount numeric, p_client_seed text
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
  v_nonce int;
  v_pc1 jsonb; v_pc2 jsonb;
  v_dc1 jsonb; v_dc2 jsonb;
  v_hands jsonb;
  v_dealer jsonb;
  v_pval int; v_dval int;
  v_pbj boolean; v_dbj boolean;
  v_bj_pays numeric;
  v_payout numeric;
  v_profit numeric;
  v_after numeric;
  v_session_id uuid;
  v_result jsonb;
BEGIN
IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

SELECT * INTO v_cfg FROM game_configs WHERE game_type = 'blackjack';
IF NOT FOUND THEN RAISE EXCEPTION 'Game not configured'; END IF;
IF p_bet_amount < v_cfg.min_bet OR p_bet_amount > v_cfg.max_bet THEN
  RAISE EXCEPTION 'Bet must be between % and %', v_cfg.min_bet, v_cfg.max_bet;
END IF;

v_debit := game_debit(v_user, p_bet_amount);
v_dev := (v_debit->>'dev')::boolean;

v_server_seed := encode(gen_random_bytes(32), 'hex');
v_seed_hash := encode(digest(v_server_seed, 'sha256'), 'hex');
SELECT COUNT(*)::int INTO v_nonce FROM game_sessions WHERE user_id = v_user;

v_bj_pays := COALESCE((v_cfg.custom->>'blackjack_pays')::numeric, 1.5);

v_pc1 := bj_card(v_server_seed, p_client_seed, 0);
v_dc1 := bj_card(v_server_seed, p_client_seed, 1);
v_pc2 := bj_card(v_server_seed, p_client_seed, 2);
v_dc2 := bj_card(v_server_seed, p_client_seed, 3);

v_hands := jsonb_build_array(jsonb_build_object(
  'cards', jsonb_build_array(v_pc1, v_pc2),
  'bet', p_bet_amount, 'doubled', false, 'done', false,
  'actions', '[]'::jsonb
));

v_dealer := jsonb_build_array(v_dc1, v_dc2);
v_pval := bj_hand_value(jsonb_build_array(v_pc1, v_pc2));
v_dval := bj_hand_value(jsonb_build_array(v_dc1));
v_pbj := (v_pval = 21);
v_dbj := (bj_hand_value(v_dealer) = 21);

IF v_pbj OR v_dbj THEN
  IF v_pbj AND v_dbj THEN
    v_payout := p_bet_amount;
    v_profit := 0;
  ELSIF v_pbj THEN
    v_payout := ROUND(p_bet_amount * (1 + v_bj_pays), 0);
    v_profit := v_payout - p_bet_amount;
  ELSE
    v_payout := 0;
    v_profit := -p_bet_amount;
  END IF;

  v_result := jsonb_build_object(
    'hands', jsonb_build_array(jsonb_build_object(
      'cards', jsonb_build_array(v_pc1, v_pc2), 'bet', p_bet_amount,
      'doubled', false, 'done', true, 'result',
      CASE WHEN v_pbj AND v_dbj THEN 'push' WHEN v_pbj THEN 'blackjack' ELSE 'lose' END,
      'payout', v_payout, 'actions', '[]'::jsonb
    )),
    'dealer', v_dealer, 'active', 0, 'settled', true,
    'dealer_value', bj_hand_value(v_dealer),
    'payout', v_payout
  );

  INSERT INTO game_sessions (user_id, game_type, status, bet_amount, payout, profit,
    client_seed, server_seed_hash, server_seed, nonce, config, result, started_at, ended_at)
  VALUES (v_user, 'blackjack', 'completed', p_bet_amount, v_payout, v_profit,
    p_client_seed, v_seed_hash, v_server_seed, v_nonce,
    jsonb_build_object('dev_mode', v_dev), v_result, now(), now())
  RETURNING id INTO v_session_id;

  INSERT INTO provably_fair (session_id, user_id, game_type, server_seed, server_seed_hash, client_seed, nonce, hmac, revealed_at)
  VALUES (v_session_id, v_user, 'blackjack', v_server_seed, v_seed_hash, p_client_seed, v_nonce,
    encode(hmac(v_server_seed, p_client_seed || ':' || v_nonce::text, 'sha256'), 'hex'), now());

  PERFORM game_tx(v_user, 'bet', -p_bet_amount, (v_debit->>'before')::numeric, (v_debit->>'after')::numeric, v_session_id, 'Blackjack bet', v_dev);
  v_after := game_credit(v_user, v_payout, v_profit, v_dev);
  IF v_payout > 0 THEN
    PERFORM game_tx(v_user, 'win', v_payout, v_after - v_payout, v_after, v_session_id, 'Blackjack win', v_dev);
  END IF;

  RETURN v_result || jsonb_build_object(
    'session_id', v_session_id, 'server_seed', v_server_seed, 'server_seed_hash', v_seed_hash,
    'client_seed', p_client_seed, 'nonce', v_nonce, 'new_balance', v_after, 'dev_mode', v_dev
  );
END IF;

v_result := jsonb_build_object(
  'hands', v_hands, 'dealer', v_dealer, 'active', 0, 'settled', false,
  'dealer_value', v_dval, 'next_idx', 4
);

INSERT INTO game_sessions (user_id, game_type, status, bet_amount, payout, profit,
  client_seed, server_seed_hash, nonce, config, result, started_at)
VALUES (v_user, 'blackjack', 'active', p_bet_amount, 0, -p_bet_amount,
  p_client_seed, v_seed_hash, v_nonce,
  jsonb_build_object('dev_mode', v_dev), v_result, now())
RETURNING id INTO v_session_id;

INSERT INTO game_secrets (session_id, server_seed, data)
VALUES (v_session_id, v_server_seed, jsonb_build_object('next_idx', 4));

PERFORM game_tx(v_user, 'bet', -p_bet_amount, (v_debit->>'before')::numeric, (v_debit->>'after')::numeric, v_session_id, 'Blackjack bet', v_dev);

RETURN v_result || jsonb_build_object(
  'session_id', v_session_id, 'server_seed_hash', v_seed_hash,
  'client_seed', p_client_seed, 'nonce', v_nonce,
  'new_balance', (v_debit->>'after')::numeric, 'dev_mode', v_dev
);
END;
$$;
