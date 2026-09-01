-- Fix case item probabilities to target ~90% RTP per case
-- EV = SUM(value * probability) should be ~0.90 * case_price

-- Starter Case ($1.00 = 100 cents) → target EV ~90 cents
DELETE FROM case_items WHERE case_id = (SELECT id FROM case_catalog WHERE slug = 'starter');
INSERT INTO case_items (case_id, name, rarity, value, probability)
SELECT c.id, v.name, v.rarity, v.value, v.probability
FROM case_catalog c
CROSS JOIN (VALUES
  ('Dirt Block', 'common', 10, 0.35),
  ('Wood Plank', 'common', 25, 0.30),
  ('Cobblestone', 'common', 50, 0.20),
  ('Iron Ingot', 'uncommon', 100, 0.10),
  ('Gold Ingot', 'rare', 300, 0.04),
  ('Diamond', 'epic', 800, 0.01)
) AS v(name, rarity, value, probability)
WHERE c.slug = 'starter';

-- Wooden Case ($5.00 = 500 cents) → target EV ~450 cents
DELETE FROM case_items WHERE case_id = (SELECT id FROM case_catalog WHERE slug = 'wooden');
INSERT INTO case_items (case_id, name, rarity, value, probability)
SELECT c.id, v.name, v.rarity, v.value, v.probability
FROM case_catalog c
CROSS JOIN (VALUES
  ('Stick', 'common', 50, 0.30),
  ('Wooden Pickaxe', 'common', 150, 0.25),
  ('Wooden Sword', 'uncommon', 300, 0.20),
  ('Leather', 'uncommon', 600, 0.15),
  ('Iron Pickaxe', 'rare', 1500, 0.07),
  ('Enchanted Book', 'epic', 4000, 0.025),
  ('Nether Star', 'legendary', 12000, 0.005)
) AS v(name, rarity, value, probability)
WHERE c.slug = 'wooden';

-- Iron Case ($20.00 = 2000 cents) → target EV ~1800 cents
DELETE FROM case_items WHERE case_id = (SELECT id FROM case_catalog WHERE slug = 'iron');
INSERT INTO case_items (case_id, name, rarity, value, probability)
SELECT c.id, v.name, v.rarity, v.value, v.probability
FROM case_catalog c
CROSS JOIN (VALUES
  ('Iron Sword', 'common', 400, 0.25),
  ('Iron Axe', 'common', 800, 0.20),
  ('Iron Armor', 'uncommon', 2000, 0.20),
  ('Shield', 'uncommon', 3500, 0.15),
  ('Bow', 'rare', 6000, 0.12),
  ('Diamond Sword', 'epic', 15000, 0.06),
  ('Netherite Ingot', 'legendary', 40000, 0.015),
  ('Dragon Egg', 'mythical', 150000, 0.005)
) AS v(name, rarity, value, probability)
WHERE c.slug = 'iron';

-- Gold Case ($50.00 = 5000 cents) → target EV ~4500 cents
DELETE FROM case_items WHERE case_id = (SELECT id FROM case_catalog WHERE slug = 'gold');
INSERT INTO case_items (case_id, name, rarity, value, probability)
SELECT c.id, v.name, v.rarity, v.value, v.probability
FROM case_catalog c
CROSS JOIN (VALUES
  ('Gold Block', 'common', 1500, 0.25),
  ('Golden Apple', 'uncommon', 3500, 0.20),
  ('Enchanted Golden Apple', 'rare', 10000, 0.20),
  ('Diamond Block', 'rare', 20000, 0.15),
  ('Netherite Sword', 'epic', 45000, 0.12),
  ('Elytra', 'legendary', 120000, 0.06),
  ('Dragon Egg', 'mythical', 400000, 0.015),
  ('Bedrock', 'mythical', 800000, 0.005)
) AS v(name, rarity, value, probability)
WHERE c.slug = 'gold';

-- Diamond Case ($100.00 = 10000 cents) → target EV ~9000 cents
DELETE FROM case_items WHERE case_id = (SELECT id FROM case_catalog WHERE slug = 'diamond');
INSERT INTO case_items (case_id, name, rarity, value, probability)
SELECT c.id, v.name, v.rarity, v.value, v.probability
FROM case_catalog c
CROSS JOIN (VALUES
  ('Diamond Block', 'uncommon', 5000, 0.25),
  ('Enchanted Diamond Sword', 'rare', 15000, 0.20),
  ('Enchanted Diamond Armor', 'rare', 25000, 0.20),
  ('Netherite Armor', 'epic', 80000, 0.15),
  ('Netherite Tools', 'epic', 100000, 0.12),
  ('Shulker Box', 'legendary', 200000, 0.05),
  ('End Crystal', 'legendary', 400000, 0.025),
  ('Command Block', 'mythical', 1500000, 0.005)
) AS v(name, rarity, value, probability)
WHERE c.slug = 'diamond';

-- Netherite Case ($250.00 = 25000 cents) → target EV ~22500 cents
DELETE FROM case_items WHERE case_id = (SELECT id FROM case_catalog WHERE slug = 'netherite');
INSERT INTO case_items (case_id, name, rarity, value, probability)
SELECT c.id, v.name, v.rarity, v.value, v.probability
FROM case_catalog c
CROSS JOIN (VALUES
  ('Netherite Block', 'rare', 20000, 0.25),
  ('Enchanted Netherite Sword', 'epic', 60000, 0.20),
  ('Enchanted Netherite Armor', 'epic', 100000, 0.15),
  ('Totem of Undying', 'legendary', 200000, 0.15),
  ('Beacon', 'legendary', 300000, 0.12),
  ('Conduit', 'legendary', 400000, 0.08),
  ('Dragon Head', 'mythical', 1000000, 0.04),
  ('Structure Block', 'mythical', 3000000, 0.01)
) AS v(name, rarity, value, probability)
WHERE c.slug = 'netherite';
