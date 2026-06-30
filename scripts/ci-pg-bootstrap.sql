-- CI bootstrap: stub the Supabase-specific auth schema and roles so vanilla
-- Postgres 15+ can apply the migrations without error.
--
-- The app connects as a trusted service role and never calls auth.uid() at
-- runtime -- only RLS policies reference it. Since CI tests do not enable RLS
-- enforcement (queries run as superuser), the stub return value is irrelevant.

-- auth schema + uid() stub
CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT '00000000-0000-0000-0000-000000000001'::uuid;
$$;

-- Supabase built-in roles used in REVOKE/GRANT statements across several migrations
DO $$ BEGIN CREATE ROLE anon;          EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
