-- Case Battle schema + case catalog + RPC functions

-- Case catalog
CREATE TABLE IF NOT EXISTS case_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('very_cheap', 'cheap', 'medium', 'premium', 'expensive', 'high_roller')),
  price bigint NOT NULL,
  image_url text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS case_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES case_catalog(id) ON DELETE CASCADE,
  name text NOT NULL,
  rarity text NOT NULL CHECK (rarity IN ('common', 'uncommon', 'rare', 'epic', 'legendary', 'mythical')),
  value bigint NOT NULL,
  probability numeric NOT NULL,
  image_url text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_items_case_id ON case_items(case_id);

-- Case battles
CREATE TABLE IF NOT EXISTS case_battles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_progress', 'completed', 'cancelled')),
  mode text NOT NULL DEFAULT 'normal' CHECK (mode IN ('normal', 'crazy', 'jackpot')),
  format text NOT NULL DEFAULT '1v1' CHECK (format IN ('1v1', '2v2')),
  fast_mode boolean NOT NULL DEFAULT false,
  entry_cost bigint NOT NULL,
  rounds_config jsonb NOT NULL,
  total_rounds int NOT NULL,
  current_round int NOT NULL DEFAULT 0,
  winner_id uuid REFERENCES profiles(id),
  winner_team text,
  jackpot_probabilities jsonb,
  created_at timestamptz DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_case_battles_status ON case_battles(status);

CREATE TABLE IF NOT EXISTS case_battle_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id uuid NOT NULL REFERENCES case_battles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team text NOT NULL DEFAULT 'A' CHECK (team IN ('A', 'B')),
  slot int NOT NULL DEFAULT 0,
  is_bot boolean NOT NULL DEFAULT false,
  bot_name text,
  joined_at timestamptz DEFAULT now(),
  UNIQUE(battle_id, slot)
);

CREATE INDEX IF NOT EXISTS idx_case_battle_participants_battle ON case_battle_participants(battle_id);

CREATE TABLE IF NOT EXISTS case_battle_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id uuid NOT NULL REFERENCES case_battles(id) ON DELETE CASCADE,
  round_number int NOT NULL,
  case_slug text NOT NULL,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(battle_id, round_number)
);

CREATE INDEX IF NOT EXISTS idx_case_battle_rounds_battle ON case_battle_rounds(battle_id);

CREATE TABLE IF NOT EXISTS case_battle_pulls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES case_battle_rounds(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES case_battle_participants(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  item_rarity text NOT NULL,
  item_value bigint NOT NULL,
  item_image_url text,
  roll_index int NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_battle_pulls_round ON case_battle_pulls(round_id);
CREATE INDEX IF NOT EXISTS idx_case_battle_pulls_participant ON case_battle_pulls(participant_id);

-- RLS
ALTER TABLE case_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_battles ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_battle_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_battle_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_battle_pulls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_case_catalog" ON case_catalog FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_case_items" ON case_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_case_battles" ON case_battles FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_case_battle_participants" ON case_battle_participants FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_case_battle_rounds" ON case_battle_rounds FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_case_battle_pulls" ON case_battle_pulls FOR SELECT TO authenticated USING (true);

CREATE POLICY "insert_case_battle" ON case_battles FOR INSERT TO authenticated WITH CHECK (creator_id = auth.uid());
CREATE POLICY "insert_case_battle_participant" ON case_battle_participants FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "insert_case_battle_round" ON case_battle_rounds FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "insert_case_battle_pull" ON case_battle_pulls FOR INSERT TO authenticated WITH CHECK (true);

-- Seed case catalog
INSERT INTO case_catalog (slug, name, category, price) VALUES
  ('starter', 'Starter Case', 'very_cheap', 100),
  ('wooden', 'Wooden Case', 'cheap', 500),
  ('iron', 'Iron Case', 'medium', 2000),
  ('gold', 'Gold Case', 'premium', 5000),
  ('diamond', 'Diamond Case', 'expensive', 10000),
  ('netherite', 'Netherite Case', 'high_roller', 25000)
ON CONFLICT (slug) DO NOTHING;
