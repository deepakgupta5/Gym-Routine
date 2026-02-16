create table if not exists system_jobs (
  job_name text primary key,
  last_run_at timestamptz not null,
  last_status text not null,
  last_detail jsonb not null default '{}'::jsonb
);

create index if not exists idx_system_jobs_last_run_at
  on system_jobs(last_run_at desc);
