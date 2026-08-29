create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create or replace function public.growthos_worker_schedule_status()
returns table (
  job_name text,
  schedule text,
  active boolean,
  last_status text,
  last_run_at timestamptz
)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select
    job.jobname::text,
    job.schedule::text,
    job.active,
    latest.status::text,
    latest.start_time
  from cron.job as job
  left join lateral (
    select run.status, run.start_time
    from cron.job_run_details as run
    where run.jobid = job.jobid
    order by run.start_time desc
    limit 1
  ) as latest on true
  where job.jobname = any(array[
    'growthos-publish-due',
    'growthos-send-messages',
    'growthos-refresh-tokens',
    'growthos-reconcile-organic',
    'growthos-sync-results'
  ]::text[])
  order by job.jobname;
$$;

revoke all on function public.growthos_worker_schedule_status() from public;
revoke all on function public.growthos_worker_schedule_status() from anon;
revoke all on function public.growthos_worker_schedule_status() from authenticated;
grant execute on function public.growthos_worker_schedule_status() to service_role;

select cron.schedule(
  'growthos-publish-due',
  '* * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'growthos_project_url') || '/functions/v1/publish-due',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-growthos-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'growthos_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  ) as request_id;
  $job$
);

select cron.schedule(
  'growthos-send-messages',
  '* * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'growthos_project_url') || '/functions/v1/send-messages',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-growthos-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'growthos_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  ) as request_id;
  $job$
);

select cron.schedule(
  'growthos-refresh-tokens',
  '*/10 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'growthos_project_url') || '/functions/v1/refresh-tokens',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-growthos-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'growthos_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  ) as request_id;
  $job$
);

select cron.schedule(
  'growthos-reconcile-organic',
  '*/2 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'growthos_project_url') || '/functions/v1/reconcile-organic',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-growthos-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'growthos_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  ) as request_id;
  $job$
);

select cron.schedule(
  'growthos-sync-results',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'growthos_project_url') || '/functions/v1/sync-results',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-growthos-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'growthos_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  ) as request_id;
  $job$
);
