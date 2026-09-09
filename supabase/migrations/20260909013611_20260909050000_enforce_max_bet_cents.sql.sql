/* Enforce the platform maximum bet in database cents. */

UPDATE game_configs
SET max_bet = 5000000,
    updated_at = now()
WHERE game_type IN ('blackjack', 'coinflip', 'dice', 'mines', 'plinko', 'roulette', 'towers');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'game_configs_max_bet_cents_limit'
      AND conrelid = 'public.game_configs'::regclass
  ) THEN
    ALTER TABLE public.game_configs
      ADD CONSTRAINT game_configs_max_bet_cents_limit
      CHECK (max_bet >= 0 AND max_bet <= 5000000);
  END IF;
END $$;
