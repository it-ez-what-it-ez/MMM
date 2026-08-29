create table if not exists public.worker_heartbeats (
  worker_name text primary key check (
    worker_name in (
      'publish-due',
      'send-messages',
      'sync-results',
      'refresh-tokens',
      'reconcile-organic'
    )
  ),
  last_succeeded_at timestamptz not null default now(),
  last_status_code integer not null check (
    last_status_code between 200 and 299
  ),
  last_duration_ms integer not null check (last_duration_ms >= 0),
  updated_at timestamptz not null default now()
);

alter table public.worker_heartbeats enable row level security;
revoke all on public.worker_heartbeats from anon, authenticated;
grant select, insert, update on public.worker_heartbeats to service_role;
