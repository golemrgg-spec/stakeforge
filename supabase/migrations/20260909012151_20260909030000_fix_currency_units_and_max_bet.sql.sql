/*
# Fix Currency Units and Max Bet

## Summary
Fixes the incorrectly scaled `max_bet` and `max_payout` values in `game_configs`.
The canonical rule is: database monetary values are in CENTS.
The intended maximum bet is $50,000 = 5,000,000 cents.
The previous `max_bet` was 50,000 (cents) = $500, which was wrong.

## Changes
1. Updates `max_bet` to 5,000,000 cents ($50,000) for all game configs.
2. Sets `max_payout` to 5,000,000,000 cents ($50,000,000) for all game configs
   — a generous platform-wide cap that will not interfere with legitimate wins,
   while preventing absurd payouts from bugs or exploits.
3. Does NOT alter wallet balances, user data, or any other tables.
4. Does NOT change game odds, multipliers, house edge, or RTP.

## Important Notes
- Existing user balances are NOT modified.
- Only `game_configs` rows are updated.
- The `max_payout` cap is intentionally very high to avoid capping legitimate wins.
*/

UPDATE game_configs
SET max_bet = 5000000,
    max_payout = 5000000000,
    updated_at = now()
WHERE game_type IN ('dice', 'mines', 'coinflip', 'plinko', 'towers', 'roulette', 'blackjack');
