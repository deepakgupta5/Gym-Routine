alter table public.user_profile
  add column if not exists skipped_dates text[] not null default '{}';
