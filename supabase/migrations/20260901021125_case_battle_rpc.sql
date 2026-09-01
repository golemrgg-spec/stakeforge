-- Case Battle RPC functions

CREATE OR REPLACE FUNCTION create_case_battle(
  p_mode text, p_format text, p_fast_mode boolean,
  p_rounds_config text[], p_entry_cost bigint
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_battle_id uuid;
  v_wallet record;
  v_existing uuid;
BEGIN
IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
IF p_mode NOT IN ('normal', 'crazy', 'jackpot') THEN RAISE EXCEPTION 'Invalid mode'; END IF;
IF p_format NOT IN ('1v1', '2v2') THEN RAISE EXCEPTION 'Invalid format'; END IF;
IF array_length(p_rounds_config, 1) IS NULL OR array_length(p_rounds_config, 1) = 0 THEN
  RAISE EXCEPTION 'Must select at least one case';
END IF;

SELECT id INTO v_existing FROM case_battles WHERE creator_id = v_user AND status = 'waiting';
IF v_existing IS NOT NULL THEN RAISE EXCEPTION 'You already have a waiting battle'; END IF;

SELECT * INTO v_wallet FROM wallets WHERE user_id = v_user FOR UPDATE;
IF v_wallet.balance < p_entry_cost THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

UPDATE wallets SET balance = balance - p_entry_cost, updated_at = now() WHERE user_id = v_user;

INSERT INTO case_battles (creator_id, status, mode, format, fast_mode, entry_cost, rounds_config, total_rounds)
VALUES (v_user, 'waiting', p_mode, p_format, p_fast_mode, p_entry_cost, to_jsonb(p_rounds_config), array_length(p_rounds_config, 1))
RETURNING id INTO v_battle_id;

INSERT INTO case_battle_participants (battle_id, user_id, team, slot, is_bot)
VALUES (v_battle_id, v_user, 'A', 0, false);

INSERT INTO wallet_transactions (wallet_id, user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
VALUES (v_wallet.id, v_user, 'bet', -p_entry_cost, v_wallet.balance, v_wallet.balance - p_entry_cost, 'case_battle', v_battle_id, 'Case Battle entry');

RETURN jsonb_build_object('battle_id', v_battle_id, 'status', 'waiting', 'entry_cost', p_entry_cost, 'new_balance', v_wallet.balance - p_entry_cost);
END;
$$;

REVOKE EXECUTE ON FUNCTION create_case_battle FROM anon;
GRANT EXECUTE ON FUNCTION create_case_battle TO authenticated;

CREATE OR REPLACE FUNCTION join_case_battle(p_battle_id uuid, p_team text, p_slot int)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_battle record;
  v_wallet record;
  v_occupied boolean;
BEGIN
IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
IF p_team NOT IN ('A', 'B') THEN RAISE EXCEPTION 'Invalid team'; END IF;

SELECT * INTO v_battle FROM case_battles WHERE id = p_battle_id FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'Battle not found'; END IF;
IF v_battle.status != 'waiting' THEN RAISE EXCEPTION 'Battle is not open'; END IF;

SELECT EXISTS(SELECT 1 FROM case_battle_participants WHERE battle_id = p_battle_id AND slot = p_slot) INTO v_occupied;
IF v_occupied THEN RAISE EXCEPTION 'Slot already occupied'; END IF;

IF EXISTS(SELECT 1 FROM case_battle_participants WHERE battle_id = p_battle_id AND user_id = v_user AND is_bot = false) THEN
  RAISE EXCEPTION 'Already joined this battle';
END IF;

SELECT * INTO v_wallet FROM wallets WHERE user_id = v_user FOR UPDATE;
IF v_wallet.balance < v_battle.entry_cost THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

UPDATE wallets SET balance = balance - v_battle.entry_cost, updated_at = now() WHERE user_id = v_user;

INSERT INTO case_battle_participants (battle_id, user_id, team, slot, is_bot)
VALUES (p_battle_id, v_user, p_team, p_slot, false);

INSERT INTO wallet_transactions (wallet_id, user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
VALUES (v_wallet.id, v_user, 'bet', -v_battle.entry_cost, v_wallet.balance, v_wallet.balance - v_battle.entry_cost, 'case_battle', p_battle_id, 'Case Battle entry');

RETURN jsonb_build_object('battle_id', p_battle_id, 'new_balance', v_wallet.balance - v_battle.entry_cost);
END;
$$;

REVOKE EXECUTE ON FUNCTION join_case_battle FROM anon;
GRANT EXECUTE ON FUNCTION join_case_battle TO authenticated;

CREATE OR REPLACE FUNCTION cancel_case_battle(p_battle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_battle record;
  v_real_count int;
  v_bot_count int;
  v_wallet record;
BEGIN
IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

SELECT * INTO v_battle FROM case_battles WHERE id = p_battle_id FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'Battle not found'; END IF;
IF v_battle.creator_id != v_user THEN RAISE EXCEPTION 'Only the creator can cancel'; END IF;
IF v_battle.status != 'waiting' THEN RAISE EXCEPTION 'Can only cancel waiting battles'; END IF;

SELECT COUNT(*) INTO v_real_count FROM case_battle_participants WHERE battle_id = p_battle_id AND is_bot = false AND user_id != v_user;
IF v_real_count > 0 THEN RAISE EXCEPTION 'Cannot cancel: others have joined'; END IF;

SELECT COUNT(*) INTO v_bot_count FROM case_battle_participants WHERE battle_id = p_battle_id AND is_bot = true;
IF v_bot_count > 0 THEN RAISE EXCEPTION 'Cannot cancel: bot has been called'; END IF;

SELECT * INTO v_wallet FROM wallets WHERE user_id = v_user FOR UPDATE;
UPDATE wallets SET balance = balance + v_battle.entry_cost, updated_at = now() WHERE user_id = v_user;

INSERT INTO wallet_transactions (wallet_id, user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
VALUES (v_wallet.id, v_user, 'refund', v_battle.entry_cost, v_wallet.balance, v_wallet.balance + v_battle.entry_cost, 'case_battle', p_battle_id, 'Case Battle refund');

UPDATE case_battles SET status = 'cancelled', completed_at = now() WHERE id = p_battle_id;
DELETE FROM case_battle_participants WHERE battle_id = p_battle_id;

RETURN jsonb_build_object('status', 'cancelled', 'new_balance', v_wallet.balance + v_battle.entry_cost);
END;
$$;

REVOKE EXECUTE ON FUNCTION cancel_case_battle FROM anon;
GRANT EXECUTE ON FUNCTION cancel_case_battle TO authenticated;

CREATE OR REPLACE FUNCTION call_case_battle_bot(p_battle_id uuid, p_team text, p_slot int)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_battle record;
  v_occupied boolean;
  v_bot_name text;
  v_total_slots int;
  v_filled_slots int;
BEGIN
IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

SELECT * INTO v_battle FROM case_battles WHERE id = p_battle_id FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'Battle not found'; END IF;
IF v_battle.status != 'waiting' THEN RAISE EXCEPTION 'Battle is not open'; END IF;
IF v_battle.creator_id != v_user THEN RAISE EXCEPTION 'Only the creator can call a bot'; END IF;

SELECT EXISTS(SELECT 1 FROM case_battle_participants WHERE battle_id = p_battle_id AND slot = p_slot) INTO v_occupied;
IF v_occupied THEN RAISE EXCEPTION 'Slot already occupied'; END IF;

v_bot_name := 'BOT_' || upper(substr(md5(random()::text), 1, 6));

INSERT INTO case_battle_participants (battle_id, user_id, team, slot, is_bot, bot_name)
VALUES (p_battle_id, v_user, p_team, p_slot, true, v_bot_name);

v_total_slots := CASE WHEN v_battle.format = '1v1' THEN 2 ELSE 4 END;
SELECT COUNT(*) INTO v_filled_slots FROM case_battle_participants WHERE battle_id = p_battle_id;

IF v_filled_slots >= v_total_slots THEN
  UPDATE case_battles SET status = 'in_progress', started_at = now() WHERE id = p_battle_id;
END IF;

RETURN jsonb_build_object('bot_name', v_bot_name, 'status', CASE WHEN v_filled_slots >= v_total_slots THEN 'in_progress' ELSE 'waiting' END, 'filled_slots', v_filled_slots, 'total_slots', v_total_slots);
END;
$$;

REVOKE EXECUTE ON FUNCTION call_case_battle_bot FROM anon;
GRANT EXECUTE ON FUNCTION call_case_battle_bot TO authenticated;

CREATE OR REPLACE FUNCTION generate_case_pull(p_case_slug text, p_client_seed text, p_nonce int)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_case record;
  v_items jsonb;
  v_server_seed text;
  v_seed_hash text;
  v_hmac bytea;
  v_roll numeric;
  v_cumulative numeric := 0;
  v_item jsonb;
  v_i int;
BEGIN
SELECT * INTO v_case FROM case_catalog WHERE slug = p_case_slug;
IF NOT FOUND THEN RAISE EXCEPTION 'Case not found'; END IF;

SELECT jsonb_agg(jsonb_build_object('name', ci.name, 'rarity', ci.rarity, 'value', ci.value, 'probability', ci.probability, 'image_url', ci.image_url) ORDER BY ci.value) INTO v_items
FROM case_items ci WHERE ci.case_id = v_case.id;

v_server_seed := encode(gen_random_bytes(32), 'hex');
v_seed_hash := encode(digest(v_server_seed, 'sha256'), 'hex');
v_hmac := hmac(v_server_seed, p_client_seed || ':' || p_nonce::text, 'sha256');
v_roll := ((('x' || encode(substring(v_hmac, 1, 4), 'hex'))::bit(32)::bigint & x'7fffffff'::bigint) % 1000000) / 1000000.0;

FOR v_i IN 0..jsonb_array_length(v_items) - 1 LOOP
  v_item := v_items->v_i;
  v_cumulative := v_cumulative + (v_item->>'probability')::numeric;
  IF v_roll < v_cumulative THEN
    RETURN jsonb_build_object('item', v_item, 'roll', v_roll, 'server_seed', v_server_seed, 'server_seed_hash', v_seed_hash);
  END IF;
END LOOP;

RETURN jsonb_build_object('item', v_items->(jsonb_array_length(v_items) - 1), 'roll', v_roll, 'server_seed', v_server_seed, 'server_seed_hash', v_seed_hash);
END;
$$;

REVOKE EXECUTE ON FUNCTION generate_case_pull FROM anon;
GRANT EXECUTE ON FUNCTION generate_case_pull TO authenticated;

CREATE OR REPLACE FUNCTION settle_case_battle(p_battle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_battle record;
  v_team_a_total bigint := 0;
  v_team_b_total bigint := 0;
  v_winner_team text;
  v_winner_id uuid;
  v_payout bigint;
  v_wallet record;
  v_jackpot_probs jsonb := '{}'::jsonb;
  v_total_value bigint := 0;
  v_roll int;
  v_hmac bytea;
  v_server_seed text;
  v_p record;
BEGIN
SELECT * INTO v_battle FROM case_battles WHERE id = p_battle_id FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'Battle not found'; END IF;
IF v_battle.status != 'in_progress' THEN RAISE EXCEPTION 'Battle not in progress'; END IF;

FOR v_p IN
  SELECT cbp.id, cbp.user_id, cbp.team, cbp.is_bot, COALESCE(SUM(cbp2.item_value), 0) AS total_value
  FROM case_battle_participants cbp
  LEFT JOIN case_battle_pulls cbp2 ON cbp2.participant_id = cbp.id
  WHERE cbp.battle_id = p_battle_id
  GROUP BY cbp.id
LOOP
  IF v_p.team = 'A' THEN v_team_a_total := v_team_a_total + v_p.total_value;
  ELSE v_team_b_total := v_team_b_total + v_p.total_value; END IF;
END LOOP;

IF v_battle.mode = 'normal' THEN
  IF v_team_a_total > v_team_b_total THEN v_winner_team := 'A';
  ELSIF v_team_b_total > v_team_a_total THEN v_winner_team := 'B';
  ELSE v_winner_team := NULL; END IF;
ELSIF v_battle.mode = 'crazy' THEN
  IF v_team_a_total < v_team_b_total THEN v_winner_team := 'A';
  ELSIF v_team_b_total < v_team_a_total THEN v_winner_team := 'B';
  ELSE v_winner_team := NULL; END IF;
ELSIF v_battle.mode = 'jackpot' THEN
  v_total_value := v_team_a_total + v_team_b_total;
  IF v_total_value = 0 THEN v_winner_team := NULL;
  ELSE
    v_server_seed := encode(gen_random_bytes(32), 'hex');
    v_hmac := hmac(v_server_seed, p_battle_id::text, 'sha256');
    v_roll := ((('x' || encode(substring(v_hmac, 1, 4), 'hex'))::bit(32)::bigint & x'7fffffff'::bigint) % 1000000)::int;
    v_jackpot_probs := jsonb_build_object('A', CASE WHEN v_total_value > 0 THEN (v_team_a_total::numeric / v_total_value) ELSE 0 END, 'B', CASE WHEN v_total_value > 0 THEN (v_team_b_total::numeric / v_total_value) ELSE 0 END);
    IF v_roll < (v_jackpot_probs->>'A')::numeric * 1000000 THEN v_winner_team := 'A';
    ELSE v_winner_team := 'B'; END IF;
  END IF;
END IF;

IF v_winner_team IS NOT NULL THEN
  v_payout := v_battle.entry_cost * CASE WHEN v_battle.format = '1v1' THEN 2 ELSE 4 END;
  v_payout := ROUND(v_payout * 0.90);

  SELECT user_id INTO v_winner_id FROM case_battle_participants
  WHERE battle_id = p_battle_id AND team = v_winner_team AND is_bot = false
  ORDER BY joined_at LIMIT 1;

  IF v_winner_id IS NOT NULL THEN
    SELECT * INTO v_wallet FROM wallets WHERE user_id = v_winner_id FOR UPDATE;
    UPDATE wallets SET balance = balance + v_payout, updated_at = now() WHERE user_id = v_winner_id;
    INSERT INTO wallet_transactions (wallet_id, user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
    VALUES (v_wallet.id, v_winner_id, 'win', v_payout, v_wallet.balance, v_wallet.balance + v_payout, 'case_battle', p_battle_id, 'Case Battle win');
  END IF;
END IF;

UPDATE case_battles SET status = 'completed', completed_at = now(), winner_id = v_winner_id, winner_team = v_winner_team, jackpot_probabilities = CASE WHEN v_battle.mode = 'jackpot' THEN v_jackpot_probs ELSE NULL END WHERE id = p_battle_id;

RETURN jsonb_build_object('status', 'completed', 'winner_team', v_winner_team, 'winner_id', v_winner_id, 'payout', v_payout, 'team_a_total', v_team_a_total, 'team_b_total', v_team_b_total);
END;
$$;

REVOKE EXECUTE ON FUNCTION settle_case_battle FROM anon;
GRANT EXECUTE ON FUNCTION settle_case_battle TO authenticated;
