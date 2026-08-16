/*
# Create platform_announcements table

1. New Tables
- `platform_announcements`
  - `id` (uuid, primary key)
  - `message` (text, not null) — short promotional text shown in the ticker
  - `is_active` (boolean, default true) — only active announcements are displayed
  - `sort_order` (integer, default 0) — controls display order
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

2. Security
- Enable RLS on `platform_announcements`.
- Allow all users (anon + authenticated) to read active announcements — these are public promotional messages.
- Only authenticated admins can create/update/delete — enforced by checking profile role.

3. Notes
- This table replaces hardcoded ticker messages in the app layout.
- Announcements are public-facing and shown to all visitors.
*/

CREATE TABLE IF NOT EXISTS platform_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE platform_announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_active_announcements" ON platform_announcements;
CREATE POLICY "read_active_announcements"
ON platform_announcements FOR SELECT
TO anon, authenticated
USING (is_active = true);

DROP POLICY IF EXISTS "admin_insert_announcements" ON platform_announcements;
CREATE POLICY "admin_insert_announcements"
ON platform_announcements FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

DROP POLICY IF EXISTS "admin_update_announcements" ON platform_announcements;
CREATE POLICY "admin_update_announcements"
ON platform_announcements FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

DROP POLICY IF EXISTS "admin_delete_announcements" ON platform_announcements;
CREATE POLICY "admin_delete_announcements"
ON platform_announcements FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- Seed initial announcements
INSERT INTO platform_announcements (message, sort_order)
VALUES
  ('Provably Fair — verify every result on-chain', 1),
  ('Weekly raffle live — every $1 wagered earns 1 ticket', 2),
  ('New: Crash multiplier now caps at 1,000,000x', 3),
  ('Deposit bonus active — claim up to $500', 4)
ON CONFLICT DO NOTHING;
