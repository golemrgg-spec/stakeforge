/*
# Game Configs and Provably Fair Tables

1. New Tables
   - `game_configs` — stores all configurable game parameters (house edge, RTP, limits).
     Admins can update values here and all future games use the new values immediately.
   - `provably_fair` — permanent record of every round's seeds and nonce for player verification.

2. game_configs columns
   - `game_type` (text, primary key) — 'mines' | 'dice'
   - `house_edge` (numeric) — e.g. 0.01 for 1%
   - `rtp` (numeric) — e.g. 0.99 for 99%
   - `min_bet` (numeric)
   - `max_bet` (numeric)
   - `max_payout` (numeric)
   - `custom` (jsonb) — game-specific parameters (board sizes, mine ranges, win chance limits)
   - `updated_at` (timestamptz)

3. provably_fair columns
   - `id` (uuid, primary key)
   - `session_id` (uuid, FK game_sessions)
   - `user_id` (uuid, FK auth.users)
   - `game_type` (text)
   - `server_seed` (text) — revealed after game ends
   - `server_seed_hash` (text) — sent to client before game starts
   - `client_seed` (text)
   - `nonce` (bigint)
   - `hmac` (text)
   - `created_at` (timestamptz)
   - `revealed_at` (timestamptz) — set when server_seed is exposed

4. Security
   - game_configs: authenticated users can read; only admins can write
   - provably_fair: owner-scoped read; no client write (service role only)

5. Seeded defaults
   - Mines: 1% house edge, 99% RTP, $0.01 min, $1000 max, $10000 max payout
   - Dice:  1% house edge, 99% RTP, $0.01 min, $1000 max, $10000 max payout
*/

CREATE TABLE IF NOT EXISTS game_configs (
  game_type   text        PRIMARY KEY,
  house_edge  numeric     NOT NULL DEFAULT 0.01,
  rtp         numeric     NOT NULL DEFAULT 0.99,
  min_bet     numeric     NOT NULL DEFAULT 0.01,
  max_bet     numeric     NOT NULL DEFAULT 1000,
  max_payout  numeric     NOT NULL DEFAULT 10000,
  custom      jsonb       NOT NULL DEFAULT '{}',
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE game_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_game_configs" ON game_configs;
CREATE POLICY "read_game_configs"
ON game_configs FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "admin_insert_game_configs" ON game_configs;
CREATE POLICY "admin_insert_game_configs"
ON game_configs FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

DROP POLICY IF EXISTS "admin_update_game_configs" ON game_configs;
CREATE POLICY "admin_update_game_configs"
ON game_configs FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

INSERT INTO game_configs (game_type, house_edge, rtp, min_bet, max_bet, max_payout, custom)
VALUES
  ('mines', 0.01, 0.99, 0.01, 1000, 10000, '{"board_sizes":[{"cols":2,"rows":2,"label":"2x2"},{"cols":3,"rows":3,"label":"3x3"},{"cols":4,"rows":4,"label":"4x4"},{"cols":5,"rows":5,"label":"5x5"},{"cols":7,"rows":7,"label":"7x7"},{"cols":10,"rows":10,"label":"10x10"}],"min_mines":1,"max_mines_fraction":0.9}'),
  ('dice',  0.01, 0.99, 0.01, 1000, 10000, '{"min_win_chance":2,"max_win_chance":98}')
ON CONFLICT (game_type) DO NOTHING;

-- provably_fair table
CREATE TABLE IF NOT EXISTS provably_fair (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       uuid        NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_type        text        NOT NULL,
  server_seed      text,
  server_seed_hash text        NOT NULL,
  client_seed      text        NOT NULL,
  nonce            bigint      NOT NULL DEFAULT 0,
  hmac             text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  revealed_at      timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS provably_fair_session_idx ON provably_fair(session_id);

ALTER TABLE provably_fair ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_pf" ON provably_fair;
CREATE POLICY "select_own_pf"
ON provably_fair FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
