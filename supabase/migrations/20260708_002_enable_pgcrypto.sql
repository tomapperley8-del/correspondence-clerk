-- The prospecting Routine calls digest() (pgcrypto) for its own dedup hashing, which failed
-- with "function digest(text, unknown) does not exist" on every run (extension not installed).
-- Enable pgcrypto so those calls resolve. Belt-and-suspenders alongside the Routine prompt patch
-- that tells it not to hash at all.
-- Applied to production via Supabase MCP on 08/07/2026.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
