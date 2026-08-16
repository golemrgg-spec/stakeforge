/*
# Atomic Game RPC Functions

All wallet modifications happen inside a single database transaction.
These functions are called by the client via supabase.rpc() and run with
SECURITY DEFINER so they can bypass RLS where needed for atomicity.

Functions:
1. `start_mines_game`  — locks bet, creates session + provably_fair record, returns hash
2. `reveal_mines_tile` — validates tile server-side, updates session state, returns result
3. `cashout_mines_game`— pays out, reveals server seed, completes session
4. `play_dice_game`    — single atomic round: locks bet, rolls, settles, reveals

Wallet safety: every function either commits ALL changes or raises an exception
that rolls back everything (PostgreSQL default transaction semantics for functions).

Extensions used: pgcrypto for gen_random_bytes (server seed generation).
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── HELPER: update wallet atomically ────────────────────────────────────────
CREATE OR REPLACE FUNCTION _deduct_balance(
  p_user_id  uuid,
  p_amount   numeric,
  p_lock     boolean  -- true = move to locked_balance, false = deduct directly
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_balance numeric;
BEGIN
  SELECT balance INTO v_balance
  FROM wallets WHERE user_id = p_user_id FOR UPDATE;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'wallet_not_found';
  END IF;
  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'insufficient_balance';
  END IF;

  IF p_lock THEN
    UPDATE wallets
    SET balance        = balance - p_amount,
        locked_balance = locked_balance + p_amount,
        total_wagered  = total_wagered + p_amount,
        updated_at     = now()
    WHERE user_id = p_user_id;
  ELSE
    UPDATE wallets
    SET balance       = balance - p_amount,
        total_wagered = total_wagered + p_amount,
        updated_at    = now()
    WHERE user_id = p_user_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION _credit_balance(
  p_user_id  uuid,
  p_amount   numeric,
  p_was_locked boolean
) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_was_locked THEN
    UPDATE wallets
    SET balance        = balance + p_amount,
        locked_balance = GREATEST(0, locked_balance - p_amount),
        lifetime_pnl   = lifetime_pnl + p_amount,
        updated_at     = now()
    WHERE user_id = p_user_id;
  ELSE
    UPDATE wallets
    SET balance      = balance + p_amount,
        lifetime_pnl = lifetime_pnl + p_amount,
        updated_at   = now()
    WHERE user_id = p_user_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION _release_locked(
  p_user_id uuid,
  p_amount  numeric
) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE wallets
  SET locked_balance = GREATEST(0, locked_balance - p_amount),
      lifetime_pnl   = lifetime_pnl - p_amount,
      updated_at     = now()
  WHERE user_id = p_user_id;
END;
$$;

-- ─── 1. START MINES GAME ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION start_mines_game(
  p_user_id       uuid,
  p_bet_amount    numeric,
  p_client_seed   text,
  p_mine_count    int,
  p_total_tiles   int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg          record;
  v_wallet       record;
  v_server_seed  text;
  v_seed_hash    text;
  v_session_id   uuid;
  v_pf_id        uuid;
  v_mine_indices int[];
  v_positions    int[];
  v_i            int;
  v_j            int;
  v_swap         int;
  v_hmac         bytea;
  v_nonce        bigint := 0;
  v_tx_id        uuid;
  v_bal_before   numeric;
BEGIN
  -- Load and validate config
  SELECT * INTO v_cfg FROM game_configs WHERE game_type = 'mines';
  IF NOT FOUND THEN RAISE EXCEPTION 'game_config_not_found'; END IF;

  IF p_bet_amount < v_cfg.min_bet THEN RAISE EXCEPTION 'bet_below_minimum'; END IF;
  IF p_bet_amount > v_cfg.max_bet THEN RAISE EXCEPTION 'bet_above_maximum'; END IF;
  IF p_mine_count < 1             THEN RAISE EXCEPTION 'invalid_mine_count'; END IF;
  IF p_mine_count >= p_total_tiles THEN RAISE EXCEPTION 'too_many_mines'; END IF;
  IF p_total_tiles < 4            THEN RAISE EXCEPTION 'invalid_board_size'; END IF;

  -- Lock bet from wallet
  SELECT balance INTO v_bal_before FROM wallets WHERE user_id = p_user_id FOR UPDATE;
  IF v_bal_before IS NULL THEN RAISE EXCEPTION 'wallet_not_found'; END IF;
  IF v_bal_before < p_bet_amount THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  UPDATE wallets
  SET balance        = balance - p_bet_amount,
      locked_balance = locked_balance + p_bet_amount,
      total_wagered  = total_wagered + p_bet_amount,
      updated_at     = now()
  WHERE user_id = p_user_id;

  -- Generate server seed (32 random bytes → hex)
  v_server_seed := encode(gen_random_bytes(32), 'hex');

  -- Compute server seed hash (SHA-256)
  v_seed_hash := encode(digest(v_server_seed, 'sha256'), 'hex');

  -- Generate mine positions via HMAC-seeded Fisher-Yates
  -- Build ordered array [0..p_total_tiles-1]
  v_positions := ARRAY(SELECT generate_series(0, p_total_tiles - 1));

  FOR v_i IN REVERSE p_total_tiles - 1 .. 1 LOOP
    -- HMAC-SHA256(server_seed, client_seed:nonce+i) → uniform int
    v_hmac := hmac(v_server_seed, p_client_seed || ':' || (v_nonce + v_i)::text, 'sha256');
    v_j := (('x' || encode(substring(v_hmac, 1, 4), 'hex'))::bit(32)::bigint & x'7fffffff'::bigint) % (v_i + 1);
    -- Swap positions[i] and positions[j]
    v_swap := v_positions[v_i + 1];
    v_positions[v_i + 1] := v_positions[v_j + 1];
    v_positions[v_j + 1] := v_swap;
  END LOOP;

  -- First p_mine_count positions are the mine locations
  v_mine_indices := v_positions[1:p_mine_count];

  -- Create game session (mine locations stored server-side in config, hidden from client)
  INSERT INTO game_sessions (
    user_id, game_type, status, bet_amount,
    client_seed, server_seed_hash, server_seed, nonce,
    config, result, started_at
  ) VALUES (
    p_user_id, 'mines', 'active', p_bet_amount,
    p_client_seed, v_seed_hash, v_server_seed, v_nonce,
    jsonb_build_object(
      'mine_count',    p_mine_count,
      'total_tiles',   p_total_tiles,
      'mine_indices',  to_jsonb(v_mine_indices),
      'house_edge',    v_cfg.house_edge
    ),
    jsonb_build_object('revealed', '[]'::jsonb, 'status', 'active'),
    now()
  )
  RETURNING id INTO v_session_id;

  -- Record provably fair (server_seed hidden until revealed)
  INSERT INTO provably_fair (session_id, user_id, game_type, server_seed, server_seed_hash, client_seed, nonce)
  VALUES (v_session_id, p_user_id, 'mines', v_server_seed, v_seed_hash, p_client_seed, v_nonce)
  RETURNING id INTO v_pf_id;

  -- Record bet transaction
  SELECT balance_after INTO v_bal_before
  FROM wallet_transactions
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  SELECT balance INTO v_bal_before FROM wallets WHERE user_id = p_user_id;

  INSERT INTO wallet_transactions (
    wallet_id, user_id, type, amount,
    balance_before, balance_after,
    reference_type, reference_id, description
  )
  SELECT
    w.id, p_user_id, 'bet', -p_bet_amount,
    v_bal_before + p_bet_amount, v_bal_before,
    'game_session', v_session_id, 'Mines bet'
  FROM wallets w WHERE w.user_id = p_user_id
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'session_id',       v_session_id,
    'server_seed_hash', v_seed_hash,
    'client_seed',      p_client_seed,
    'nonce',            v_nonce,
    'mine_count',       p_mine_count,
    'total_tiles',      p_total_tiles,
    'pf_id',            v_pf_id
  );
END;
$$;

-- ─── 2. REVEAL MINES TILE ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION reveal_mines_tile(
  p_user_id    uuid,
  p_session_id uuid,
  p_tile_index int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session   record;
  v_cfg       record;
  v_revealed  jsonb;
  v_mines     jsonb;
  v_is_mine   boolean;
  v_safe_count int;
  v_total     int;
  v_mine_count int;
  v_multiplier numeric;
  v_payout    numeric;
  v_bal_before numeric;
BEGIN
  SELECT * INTO v_session
  FROM game_sessions
  WHERE id = p_session_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;
  IF v_session.status <> 'active' THEN RAISE EXCEPTION 'session_not_active'; END IF;

  v_revealed   := COALESCE(v_session.result -> 'revealed', '[]'::jsonb);
  v_mines      := v_session.config -> 'mine_indices';
  v_total      := (v_session.config ->> 'total_tiles')::int;
  v_mine_count := (v_session.config ->> 'mine_count')::int;

  -- Check tile not already revealed
  IF v_revealed @> to_jsonb(p_tile_index) THEN
    RAISE EXCEPTION 'tile_already_revealed';
  END IF;

  -- Check if tile is a mine
  v_is_mine := v_mines @> to_jsonb(p_tile_index);

  IF v_is_mine THEN
    -- Game over: release locked balance (loss), reveal server seed
    PERFORM _release_locked(p_user_id, v_session.bet_amount);

    UPDATE provably_fair
    SET server_seed = v_session.server_seed, revealed_at = now()
    WHERE session_id = p_session_id;

    UPDATE game_sessions
    SET status   = 'completed',
        payout   = 0,
        profit   = -v_session.bet_amount,
        result   = jsonb_build_object(
                     'revealed',    v_revealed,
                     'hit_mine',    p_tile_index,
                     'mine_indices', v_mines,
                     'status',      'lost'
                   ),
        ended_at = now(),
        updated_at = now()
    WHERE id = p_session_id;

    UPDATE wallets
    SET lifetime_pnl = lifetime_pnl - v_session.bet_amount,
        updated_at   = now()
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object(
      'is_mine',      true,
      'mine_indices', v_mines,
      'server_seed',  v_session.server_seed,
      'multiplier',   0,
      'payout',       0
    );
  END IF;

  -- Safe tile: update revealed list
  v_revealed  := v_revealed || to_jsonb(p_tile_index);
  v_safe_count := jsonb_array_length(v_revealed);

  -- Calculate current multiplier using combinatorial formula
  -- multiplier = prod_{k=0}^{safe_count-1} (total - mine_count - k) / (total - k) * RTP
  -- Inverted: multiplier = (1 / cumulative_safe_probability) * rtp
  DECLARE
    v_numerator   numeric := 1;
    v_denominator numeric := 1;
    v_rtp         numeric;
    k             int;
  BEGIN
    SELECT rtp INTO v_rtp FROM game_configs WHERE game_type = 'mines';
    FOR k IN 0 .. v_safe_count - 1 LOOP
      v_numerator   := v_numerator   * (v_total - v_mine_count - k);
      v_denominator := v_denominator * (v_total - k);
    END LOOP;

    IF v_numerator <= 0 OR v_denominator <= 0 THEN
      v_multiplier := 0;
    ELSE
      v_multiplier := ROUND((v_denominator::numeric / v_numerator::numeric) * v_rtp, 4);
    END IF;
  END;

  v_payout := ROUND(v_session.bet_amount * v_multiplier, 2);

  UPDATE game_sessions
  SET result     = jsonb_build_object(
                     'revealed',   v_revealed,
                     'status',     'active',
                     'multiplier', v_multiplier
                   ),
      updated_at = now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'is_mine',    false,
    'revealed',   v_revealed,
    'multiplier', v_multiplier,
    'payout',     v_payout,
    'safe_count', v_safe_count
  );
END;
$$;

-- ─── 3. CASHOUT MINES GAME ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cashout_mines_game(
  p_user_id    uuid,
  p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session    record;
  v_rtp        numeric;
  v_revealed   jsonb;
  v_safe_count int;
  v_total      int;
  v_mine_count int;
  v_numerator  numeric := 1;
  v_denom      numeric := 1;
  v_multiplier numeric;
  v_payout     numeric;
  v_profit     numeric;
  v_bal_before numeric;
  k            int;
BEGIN
  SELECT * INTO v_session
  FROM game_sessions
  WHERE id = p_session_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;
  IF v_session.status <> 'active' THEN RAISE EXCEPTION 'session_not_active'; END IF;

  v_revealed   := COALESCE(v_session.result -> 'revealed', '[]'::jsonb);
  v_safe_count := jsonb_array_length(v_revealed);

  IF v_safe_count = 0 THEN RAISE EXCEPTION 'no_tiles_revealed'; END IF;

  v_total      := (v_session.config ->> 'total_tiles')::int;
  v_mine_count := (v_session.config ->> 'mine_count')::int;

  SELECT rtp INTO v_rtp FROM game_configs WHERE game_type = 'mines';

  FOR k IN 0 .. v_safe_count - 1 LOOP
    v_numerator := v_numerator * (v_total - v_mine_count - k);
    v_denom     := v_denom     * (v_total - k);
  END LOOP;

  v_multiplier := ROUND((v_denom::numeric / v_numerator::numeric) * v_rtp, 4);
  v_payout     := ROUND(v_session.bet_amount * v_multiplier, 2);
  v_profit     := v_payout - v_session.bet_amount;

  -- Release locked balance then credit payout
  UPDATE wallets
  SET balance        = balance + v_payout,
      locked_balance = GREATEST(0, locked_balance - v_session.bet_amount),
      lifetime_pnl   = lifetime_pnl + v_profit,
      updated_at     = now()
  WHERE user_id = p_user_id;

  -- Record win transaction
  SELECT balance INTO v_bal_before FROM wallets WHERE user_id = p_user_id;

  INSERT INTO wallet_transactions (
    wallet_id, user_id, type, amount,
    balance_before, balance_after,
    reference_type, reference_id, description
  )
  SELECT
    w.id, p_user_id, 'win', v_payout,
    v_bal_before - v_payout, v_bal_before,
    'game_session', p_session_id, 'Mines cashout'
  FROM wallets w WHERE w.user_id = p_user_id;

  -- Reveal server seed
  UPDATE provably_fair
  SET server_seed = v_session.server_seed, revealed_at = now()
  WHERE session_id = p_session_id;

  UPDATE game_sessions
  SET status     = 'completed',
      payout     = v_payout,
      profit     = v_profit,
      result     = jsonb_build_object(
                     'revealed',    v_revealed,
                     'mine_indices', v_session.config -> 'mine_indices',
                     'multiplier',  v_multiplier,
                     'status',      'cashed_out'
                   ),
      ended_at   = now(),
      updated_at = now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'payout',      v_payout,
    'profit',      v_profit,
    'multiplier',  v_multiplier,
    'server_seed', v_session.server_seed,
    'mine_indices', v_session.config -> 'mine_indices'
  );
END;
$$;

-- ─── 4. PLAY DICE GAME ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION play_dice_game(
  p_user_id       uuid,
  p_bet_amount    numeric,
  p_client_seed   text,
  p_win_chance    numeric,   -- percentage e.g. 50.00
  p_direction     text       -- 'over' | 'under'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg          record;
  v_server_seed  text;
  v_seed_hash    text;
  v_session_id   uuid;
  v_pf_id        uuid;
  v_hmac         bytea;
  v_nonce        bigint := 0;
  v_rolled       numeric;    -- 0-99.99 (two decimal precision)
  v_target       numeric;
  v_is_win       boolean;
  v_multiplier   numeric;
  v_payout       numeric;
  v_profit       numeric;
  v_bal_before   numeric;
  v_bal_after    numeric;
  v_tx_type      wallet_tx_type;
BEGIN
  SELECT * INTO v_cfg FROM game_configs WHERE game_type = 'dice';
  IF NOT FOUND THEN RAISE EXCEPTION 'game_config_not_found'; END IF;

  IF p_bet_amount < v_cfg.min_bet THEN RAISE EXCEPTION 'bet_below_minimum'; END IF;
  IF p_bet_amount > v_cfg.max_bet THEN RAISE EXCEPTION 'bet_above_maximum'; END IF;

  DECLARE
    v_min_wc numeric := COALESCE((v_cfg.custom ->> 'min_win_chance')::numeric, 2);
    v_max_wc numeric := COALESCE((v_cfg.custom ->> 'max_win_chance')::numeric, 98);
  BEGIN
    IF p_win_chance < v_min_wc OR p_win_chance > v_max_wc THEN
      RAISE EXCEPTION 'invalid_win_chance';
    END IF;
  END;

  IF p_direction NOT IN ('over', 'under') THEN
    RAISE EXCEPTION 'invalid_direction';
  END IF;

  -- Deduct balance immediately (dice is single-round, no lock needed)
  SELECT balance INTO v_bal_before FROM wallets WHERE user_id = p_user_id FOR UPDATE;
  IF v_bal_before IS NULL THEN RAISE EXCEPTION 'wallet_not_found'; END IF;
  IF v_bal_before < p_bet_amount THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  UPDATE wallets
  SET balance       = balance - p_bet_amount,
      total_wagered = total_wagered + p_bet_amount,
      updated_at    = now()
  WHERE user_id = p_user_id;

  -- Generate server seed
  v_server_seed := encode(gen_random_bytes(32), 'hex');
  v_seed_hash   := encode(digest(v_server_seed, 'sha256'), 'hex');

  -- Roll: HMAC-SHA256(server_seed, client_seed:0) → float [0,100)
  v_hmac  := hmac(v_server_seed, p_client_seed || ':0', 'sha256');
  -- Use first 4 bytes for precision, map to [0, 10000) then divide by 100
  v_rolled := (('x' || encode(substring(v_hmac, 1, 4), 'hex'))::bit(32)::bigint & x'7fffffff'::bigint)
              % 10000;
  v_rolled := ROUND(v_rolled::numeric / 100.0, 2);  -- 0.00 to 99.99

  -- Compute target and win condition
  IF p_direction = 'under' THEN
    v_target  := ROUND(p_win_chance, 2);
    v_is_win  := v_rolled < v_target;
  ELSE  -- over
    v_target  := ROUND(100.0 - p_win_chance, 2);
    v_is_win  := v_rolled > v_target;
  END IF;

  -- Multiplier = RTP / (win_chance / 100)
  v_multiplier := ROUND((v_cfg.rtp / (p_win_chance / 100.0)), 4);
  v_payout     := CASE WHEN v_is_win THEN ROUND(p_bet_amount * v_multiplier, 2) ELSE 0 END;
  v_profit     := v_payout - p_bet_amount;

  IF v_payout > v_cfg.max_payout THEN
    v_payout := v_cfg.max_payout;
    v_profit := v_payout - p_bet_amount;
  END IF;

  -- Credit winnings and update stats
  IF v_is_win THEN
    UPDATE wallets
    SET balance      = balance + v_payout,
        lifetime_pnl = lifetime_pnl + v_profit,
        updated_at   = now()
    WHERE user_id = p_user_id;
    v_tx_type := 'win';
  ELSE
    UPDATE wallets
    SET lifetime_pnl = lifetime_pnl - p_bet_amount,
        updated_at   = now()
    WHERE user_id = p_user_id;
    v_tx_type := 'bet';
  END IF;

  SELECT balance INTO v_bal_after FROM wallets WHERE user_id = p_user_id;

  -- Create game session (completed immediately)
  INSERT INTO game_sessions (
    user_id, game_type, status, bet_amount, payout, profit,
    client_seed, server_seed_hash, server_seed, nonce,
    config, result, started_at, ended_at
  ) VALUES (
    p_user_id, 'dice', 'completed', p_bet_amount, v_payout, v_profit,
    p_client_seed, v_seed_hash, v_server_seed, v_nonce,
    jsonb_build_object(
      'win_chance',  p_win_chance,
      'direction',   p_direction,
      'house_edge',  v_cfg.house_edge
    ),
    jsonb_build_object(
      'rolled',      v_rolled,
      'target',      v_target,
      'direction',   p_direction,
      'is_win',      v_is_win,
      'multiplier',  v_multiplier
    ),
    now(), now()
  )
  RETURNING id INTO v_session_id;

  -- Record provably fair
  INSERT INTO provably_fair (
    session_id, user_id, game_type,
    server_seed, server_seed_hash, client_seed, nonce, hmac, revealed_at
  ) VALUES (
    v_session_id, p_user_id, 'dice',
    v_server_seed, v_seed_hash, p_client_seed, v_nonce,
    encode(v_hmac, 'hex'), now()
  )
  RETURNING id INTO v_pf_id;

  -- Record wallet transaction
  INSERT INTO wallet_transactions (
    wallet_id, user_id, type, amount,
    balance_before, balance_after,
    reference_type, reference_id, description
  )
  SELECT
    w.id, p_user_id, v_tx_type,
    CASE WHEN v_is_win THEN v_payout ELSE -p_bet_amount END,
    v_bal_before, v_bal_after,
    'game_session', v_session_id,
    CASE WHEN v_is_win THEN 'Dice win' ELSE 'Dice bet' END
  FROM wallets w WHERE w.user_id = p_user_id;

  RETURN jsonb_build_object(
    'session_id',       v_session_id,
    'rolled',           v_rolled,
    'target',           v_target,
    'is_win',           v_is_win,
    'multiplier',       v_multiplier,
    'payout',           v_payout,
    'profit',           v_profit,
    'server_seed',      v_server_seed,
    'server_seed_hash', v_seed_hash,
    'client_seed',      p_client_seed,
    'nonce',            v_nonce,
    'pf_id',            v_pf_id
  );
END;
$$;

-- ─── 5. GET ACTIVE GAME SESSIONS (admin) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION get_active_game_sessions()
RETURNS TABLE(
  session_id    uuid,
  user_id       uuid,
  username      text,
  game_type     text,
  bet_amount    numeric,
  current_mult  numeric,
  started_at    timestamptz,
  board_state   jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    gs.id,
    gs.user_id,
    p.username,
    gs.game_type,
    gs.bet_amount,
    COALESCE((gs.result ->> 'multiplier')::numeric, 1.0),
    gs.started_at,
    gs.result
  FROM game_sessions gs
  JOIN profiles p ON p.id = gs.user_id
  WHERE gs.status = 'active'
  ORDER BY gs.started_at DESC;
$$;

-- ─── 6. CANCEL STUCK GAME (admin) ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_cancel_game_session(
  p_admin_id   uuid,
  p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_role text;
  v_session    record;
BEGIN
  SELECT role INTO v_admin_role FROM profiles WHERE id = p_admin_id;
  IF v_admin_role <> 'admin' THEN RAISE EXCEPTION 'unauthorized'; END IF;

  SELECT * INTO v_session FROM game_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;
  IF v_session.status <> 'active' THEN RAISE EXCEPTION 'session_not_active'; END IF;

  -- Refund locked bet
  UPDATE wallets
  SET balance        = balance + v_session.bet_amount,
      locked_balance = GREATEST(0, locked_balance - v_session.bet_amount),
      total_wagered  = GREATEST(0, total_wagered - v_session.bet_amount),
      updated_at     = now()
  WHERE user_id = v_session.user_id;

  -- Record refund transaction
  INSERT INTO wallet_transactions (
    wallet_id, user_id, type, amount,
    balance_before, balance_after,
    reference_type, reference_id, description
  )
  SELECT
    w.id, v_session.user_id, 'refund', v_session.bet_amount,
    w.balance - v_session.bet_amount, w.balance,
    'game_session', p_session_id, 'Admin cancelled game'
  FROM wallets w WHERE w.user_id = v_session.user_id;

  UPDATE game_sessions
  SET status     = 'cancelled',
      payout     = v_session.bet_amount,
      profit     = 0,
      ended_at   = now(),
      updated_at = now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object('refunded', v_session.bet_amount, 'session_id', p_session_id);
END;
$$;
