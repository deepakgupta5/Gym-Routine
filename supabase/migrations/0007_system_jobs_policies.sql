begin;

alter table public.system_jobs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'system_jobs'
      and policyname = 'system_jobs_no_access_anon'
  ) then
    execute $p$
      create policy system_jobs_no_access_anon
      on public.system_jobs
      for all
      to anon
      using (false)
      with check (false)
    $p$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'system_jobs'
      and policyname = 'system_jobs_no_access_authenticated'
  ) then
    execute $p$
      create policy system_jobs_no_access_authenticated
      on public.system_jobs
      for all
      to authenticated
      using (false)
      with check (false)
    $p$;
  end if;
end
$$;

commit;
