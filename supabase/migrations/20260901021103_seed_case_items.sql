-- Seed case items for all cases (targeting ~90% RTP)

-- Starter Case ($1.00)
INSERT INTO case_items (case_id, name, rarity, value, probability)
SELECT c.id, v.name, v.rarity, v.value, v.probability
FROM case_catalog c
CROSS JOIN (VALUES
  ('Dirt Block', 'common', 20, 0.30),
  ('Wood Plank', 'common', 40, 0.25),
  ('Cobblestone', 'common', 60, 0.20),
  ('Iron Ingot', 'uncommon', 150, 0.15),
  ('Gold Ingot', 'rare', 400, 0.08),
  ('Diamond', 'epic', 1000, 0.02)
) AS v(name, rarity, value, probability)
WHERE c.slug = 'starter'
AND NOT EXISTS (SELECT 1 FROM case_items WHERE case_id = c.id);

-- Wooden Case ($5.00)
INSERT INTO case_items (case_id, name, rarity, value, probability)
SELECT c.id, v.name, v.rarity, v.value, v.probability
FROM case_catalog c
CROSS JOIN (VALUES
  ('Stick', 'common', 50, 0.25),
  ('Wooden Pickaxe', 'common', 200, 0.25),
  ('Wooden Sword', 'uncommon', 500, 0.20),
  ('Leather', 'uncommon', 800, 0.15),
  ('Iron Pickaxe', 'rare', 2000, 0.10),
  ('Enchanted Book', 'epic', 5000, 0.04),
  ('Nether Star', 'legendary', 15000, 0.01)
) AS v(name, rarity, value, probability)
WHERE c.slug = 'wooden'
AND NOT EXISTS (SELECT 1 FROM case_items WHERE case_id = c.id);

-- Iron Case ($20.00)
INSERT INTO case_items (case_id, name, rarity, value, probability)
SELECT c.id, v.name, v.rarity, v.value, v.probability
FROM case_catalog c
CROSS JOIN (VALUES
  ('Iron Sword', 'common', 500, 0.20),
  ('Iron Axe', 'common', 1000, 0.20),
  ('Iron Armor', 'uncommon', 3000, 0.20),
  ('Shield', 'uncommon', 5000, 0.15),
  ('Bow', 'rare', 8000, 0.12),
  ('Diamond Sword', 'epic', 20000, 0.08),
  ('Netherite Ingot', 'legendary', 50000, 0.04),
  ('Dragon Egg', 'mythical', 200000, 0.01)
) AS v(name, rarity, value, probability)
WHERE c.slug = 'iron'
AND NOT EXISTS (SELECT 1 FROM case_items WHERE case_id = c.id);

-- Gold Case ($50.00)
INSERT INTO case_items (case_id, name, rarity, value, probability)
SELECT c.id, v.name, v.rarity, v.value, v.probability
FROM case_catalog c
CROSS JOIN (VALUES
  ('Gold Block', 'common', 2000, 0.20),
  ('Golden Apple', 'uncommon', 5000, 0.20),
  ('Enchanted Golden Apple', 'rare', 15000, 0.20),
  ('Diamond Block', 'rare', 25000, 0.15),
  ('Netherite Sword', 'epic', 60000, 0.12),
  ('Elytra', 'legendary', 150000, 0.08),
  ('Dragon Egg', 'mythical', 500000, 0.04),
  ('Bedrock', 'mythical', 1000000, 0.01)
) AS v(name, rarity, value, probability)
WHERE c.slug = 'gold'
AND NOT EXISTS (SELECT 1 FROM case_items WHERE case_id = c.id);

-- Diamond Case ($100.00)
INSERT INTO case_items (case_id, name, rarity, value, probability)
SELECT c.id, v.name, v.rarity, v.value, v.probability
FROM case_catalog c
CROSS JOIN (VALUES
  ('Diamond Block', 'uncommon', 10000, 0.20),
  ('Enchanted Diamond Sword', 'rare', 30000, 0.20),
  ('Enchanted Diamond Armor', 'rare', 50000, 0.20),
  ('Netherite Armor', 'epic', 120000, 0.15),
  ('Netherite Tools', 'epic', 150000, 0.12),
  ('Shulker Box', 'legendary', 300000, 0.08),
  ('End Crystal', 'legendary', 500000, 0.04),
  ('Command Block', 'mythical', 2000000, 0.01)
) AS v(name, rarity, value, probability)
WHERE c.slug = 'diamond'
AND NOT EXISTS (SELECT 1 FROM case_items WHERE case_id = c.id);

-- Netherite Case ($250.00)
INSERT INTO case_items (case_id, name, rarity, value, probability)
SELECT c.id, v.name, v.rarity, v.value, v.probability
FROM case_catalog c
CROSS JOIN (VALUES
  ('Netherite Block', 'rare', 50000, 0.20),
  ('Enchanted Netherite Sword', 'epic', 150000, 0.20),
  ('Enchanted Netherite Armor', 'epic', 250000, 0.15),
  ('Totem of Undying', 'legendary', 400000, 0.15),
  ('Beacon', 'legendary', 600000, 0.12),
  ('Conduit', 'legendary', 800000, 0.08),
  ('Dragon Head', 'mythical', 2000000, 0.06),
  ('Structure Block', 'mythical', 5000000, 0.04)
) AS v(name, rarity, value, probability)
WHERE c.slug = 'netherite'
AND NOT EXISTS (SELECT 1 FROM case_items WHERE case_id = c.id);
