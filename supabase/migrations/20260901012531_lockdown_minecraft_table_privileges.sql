/*
# Lock Down Sensitive Minecraft Tables

## Problem
The initial migration REVOKE'd INSERT/UPDATE/DELETE from `authenticated` on
gaming_wallets, minecraft_links, and wallet_transfers, but did NOT revoke
from `anon`. Additionally, minecraft_server_config and minecraft_link_codes
still had full write privileges for both roles.

## Fix
- REVOKE INSERT, UPDATE, DELETE from both `anon` AND `authenticated` on:
  gaming_wallets, minecraft_links, wallet_transfers, minecraft_link_codes
- REVOKE ALL privileges from `anon` AND `authenticated` on minecraft_server_config
  (only the service role used by edge functions can access it)
- minecraft_link_codes: keep SELECT for authenticated (user can read their own codes),
  INSERT is handled by the SECURITY DEFINER function generate_link_code()
*/

-- gaming_wallets: only SELECT for authenticated, nothing for anon
REVOKE INSERT, UPDATE, DELETE ON gaming_wallets FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON gaming_wallets FROM anon;

-- minecraft_links: only SELECT for authenticated, nothing for anon
REVOKE INSERT, UPDATE, DELETE ON minecraft_links FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON minecraft_links FROM anon;

-- wallet_transfers: only SELECT for authenticated, nothing for anon
REVOKE INSERT, UPDATE, DELETE ON wallet_transfers FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON wallet_transfers FROM anon;

-- minecraft_link_codes: SELECT for authenticated, INSERT via SECURITY DEFINER only
REVOKE INSERT, UPDATE, DELETE ON minecraft_link_codes FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON minecraft_link_codes FROM anon;

-- minecraft_server_config: NO access for anon or authenticated (service role only)
REVOKE ALL ON minecraft_server_config FROM anon;
REVOKE ALL ON minecraft_server_config FROM authenticated;
