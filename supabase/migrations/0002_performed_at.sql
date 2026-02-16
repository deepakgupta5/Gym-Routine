alter table plan_sessions
  add column if not exists performed_at timestamptz null;

create index if not exists idx_plan_sessions_user_performed
  on plan_sessions(user_id, performed_at);

create index if not exists idx_set_logs_session
  on set_logs(session_id);
