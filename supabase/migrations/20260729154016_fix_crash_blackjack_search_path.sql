/*
  # Align Crash/Blackjack function search_path with Mines

  pgcrypto (digest/hmac) is installed in the `extensions` schema. The mines
  functions use search_path = public, extensions; apply the same to the new
  game RPCs and helpers so crypto calls resolve.
*/

ALTER FUNCTION start_crash_game(numeric, text) SET search_path TO 'public', 'extensions';
ALTER FUNCTION resolve_crash_game(uuid, boolean, numeric) SET search_path TO 'public', 'extensions';
ALTER FUNCTION blackjack_deal(numeric, text) SET search_path TO 'public', 'extensions';
ALTER FUNCTION blackjack_action(uuid, text) SET search_path TO 'public', 'extensions';
ALTER FUNCTION bj_card(text, text, int) SET search_path TO 'public', 'extensions';
ALTER FUNCTION bj_hand_value(jsonb) SET search_path TO 'public', 'extensions';
ALTER FUNCTION game_debit(uuid, numeric) SET search_path TO 'public', 'extensions';
ALTER FUNCTION game_credit(uuid, numeric, numeric, boolean) SET search_path TO 'public', 'extensions';
ALTER FUNCTION game_tx(uuid, text, numeric, numeric, numeric, uuid, text, boolean) SET search_path TO 'public', 'extensions';

ALTER FUNCTION play_coinflip_game(numeric, text, text) SET search_path TO 'public', 'extensions';
ALTER FUNCTION play_plinko_game(numeric, text, text) SET search_path TO 'public', 'extensions';
ALTER FUNCTION start_towers_game(numeric, text, text) SET search_path TO 'public', 'extensions';
ALTER FUNCTION pick_towers_tile(uuid, int) SET search_path TO 'public', 'extensions';
ALTER FUNCTION cashout_towers_game(uuid) SET search_path TO 'public', 'extensions';