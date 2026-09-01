/*
# Enable pgcrypto for gen_random_bytes

The generate_link_code function uses gen_random_bytes() to create
verification codes, but pgcrypto wasn't enabled. Enable it now.
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto;
