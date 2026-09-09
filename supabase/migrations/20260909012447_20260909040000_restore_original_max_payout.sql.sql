/*
# Restore Original max_payout Values

## Summary
Reverts the max_payout changes made by the currency migration
(20260909030000_fix_currency_units_and_max_bet.sql) back to each game's
original effectively-unlimited values. The max_bet of 5,000,000 cents
($50,000) is preserved and NOT changed.

## Changes
1. Restores max_payout to pre-migration values for all 7 game configs.
2. Does NOT touch max_bet (stays at 5,000,000 cents = $50,000).
3. Does NOT alter wallet balances, game math, odds, or multipliers.

## Important Notes
- This only updates the max_payout column in game_configs.
- All max_payout values are effectively unlimited (very large numbers).
*/

UPDATE game_configs SET max_payout = 100000000000000000000,                 updated_at = now() WHERE game_type = 'blackjack';
UPDATE game_configs SET max_payout = 10000000000000000000000000000000000,   updated_at = now() WHERE game_type = 'coinflip';
UPDATE game_configs SET max_payout = 9999999999999,                          updated_at = now() WHERE game_type = 'dice';
UPDATE game_configs SET max_payout = 10000000000000000,                      updated_at = now() WHERE game_type = 'mines';
UPDATE game_configs SET max_payout = 100000000000000000000,                  updated_at = now() WHERE game_type = 'plinko';
UPDATE game_configs SET max_payout = 1000000000000000000000000000000000,     updated_at = now() WHERE game_type = 'roulette';
UPDATE game_configs SET max_payout = 1000000000000000000000000000000000000,  updated_at = now() WHERE game_type = 'towers';
