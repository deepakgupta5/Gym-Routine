-- 0013_fix_utc_date_search_path.sql
-- Fix Advisor warning: function must have fixed search_path.

CREATE OR REPLACE FUNCTION public.utc_date(ts timestamptz)
RETURNS date
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT (ts AT TIME ZONE 'UTC')::date
$$;
