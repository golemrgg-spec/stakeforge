-- Clear all balances and history per user request
TRUNCATE wallet_transactions CASCADE;
TRUNCATE game_sessions CASCADE;
TRUNCATE provably_fair CASCADE;
TRUNCATE game_secrets CASCADE;
TRUNCATE bets CASCADE;
TRUNCATE wallet_transfers CASCADE;
TRUNCATE admin_wallet_actions CASCADE;
TRUNCATE leaderboards CASCADE;

UPDATE wallets SET
  balance = 0,
  locked_balance = 0,
  total_wagered = 0,
  lifetime_pnl = 0,
  lifetime_wins = 0,
  lifetime_losses = 0,
  dev_balance = 0,
  updated_at = now();
