-- Remove Crash tables and functions
DROP TABLE IF EXISTS crash_bets CASCADE;
DROP TABLE IF EXISTS crash_rounds CASCADE;

DROP FUNCTION IF EXISTS crash_place_bet(numeric, text);
DROP FUNCTION IF EXISTS crash_cashout(uuid);
DROP FUNCTION IF EXISTS crash_ensure_running();
