/*
# Minecraft Server Token Storage

Stores the Minecraft server authentication token in the database so the
minecraft-bridge edge function can verify the X-Server-Token header.
RLS is enabled with NO policies — only the service role (used by edge functions)
can read this table. Frontend clients cannot access it.
*/

CREATE TABLE IF NOT EXISTS minecraft_server_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE minecraft_server_config ENABLE ROW LEVEL SECURITY;

-- Insert the server token
INSERT INTO minecraft_server_config (key, value)
VALUES ('server_token', 'Ys2vXJlVEMVVqTK3VOjVrdED1Hcy8VQDnpU2be4w')
ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now();
