-- House edge rebalancing + game config updates
-- All monetary values now in cents (1 MD = 100 cents)

UPDATE game_configs SET
  min_bet = 10,
  max_bet = 1000000000,
  max_payout = 5000000000,
  house_edge = 0.05,
  rtp = 0.95,
  custom = '{"decks": 6, "blackjack_pays": 1.2}'::jsonb
WHERE game_type = 'blackjack';

UPDATE game_configs SET
  min_bet = 10,
  max_bet = 1000000000,
  max_payout = 5000000000,
  house_edge = 0.09,
  rtp = 0.91,
  custom = '{"rows": 16, "risks": ["easy", "normal", "hard"]}'::jsonb
WHERE game_type = 'plinko';

UPDATE game_configs SET
  min_bet = 10,
  max_bet = 1000000000,
  max_payout = 5000000000,
  house_edge = 0.09,
  rtp = 0.91,
  custom = '{"risks": ["easy", "normal", "hard"], "levels": 8}'::jsonb
WHERE game_type = 'towers';

UPDATE game_configs SET
  min_bet = 10,
  max_bet = 1000000000,
  max_payout = 5000000000,
  house_edge = 0.06,
  rtp = 0.94,
  custom = '{"sides": ["heads", "tails"]}'::jsonb
WHERE game_type = 'coinflip';

UPDATE game_configs SET
  min_bet = 10,
  max_bet = 1000000000,
  max_payout = 5000000000,
  house_edge = 0.0667,
  rtp = 0.9333,
  custom = '{"colors": [{"name": "red", "payout": 2, "weight": 466667}, {"name": "purple", "payout": 2, "weight": 466667}, {"name": "yellow", "payout": 14, "weight": 66667}]}'::jsonb
WHERE game_type = 'roulette';

UPDATE game_configs SET
  min_bet = 10,
  max_bet = 1000000000,
  max_payout = 5000000000
WHERE game_type = 'mines';

UPDATE game_configs SET
  min_bet = 10,
  max_bet = 1000000000,
  max_payout = 5000000000
WHERE game_type = 'dice';

-- Remove crash game config
DELETE FROM game_configs WHERE game_type = 'crash';
