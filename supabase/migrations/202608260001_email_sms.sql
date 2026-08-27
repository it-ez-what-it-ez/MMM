-- GrowthOS production email and SMS delivery.
-- This migration creates no contacts and grants no inferred marketing consent.

alter table public.provider_connections
  drop constraint if exists provider_connections_provider_key_check;
alter table public.provider_connections
  add constraint provider_connections_provider_key_check check (
    provider_key in (
      'meta_business', 'google_ads', 'ga4', 'tiktok_ads',
      'tiktok_organic', 'reddit_ads', 'linkedin_pages', 'chatgpt_ads',
      'twilio_messaging', 'sendgrid_email'
    )
  );

-- Older deployments created content-version copy before messaging became a
-- first-class field. Enrich every future insert without relying on a modified
-- historical RPC, then backfill any pre-migration messaging drafts.
create or replace function private.enrich_content_version_messaging()
returns trigger language plpgsql security definer set search_path = '' as $$
declare messaging_copy jsonb;
begin
  if new.copy ? 'messaging' then return new; end if;
  select plan_item -> 'messaging' into messaging_copy
  from public.content_items item
  join public.campaigns campaign on campaign.id = item.campaign_id
  cross join lateral jsonb_array_elements(campaign.plan -> 'content') as plan_row(plan_item)
  where item.id = new.content_item_id and plan_item ->> 'id' = item.id::text
  limit 1;
  if messaging_copy is not null then
    new.copy := new.copy || jsonb_build_object('messaging', messaging_copy);
  end if;
  return new;
end;
$$;
create trigger content_version_messaging_copy
before insert on public.content_versions
for each row execute function private.enrich_content_version_messaging();

update public.content_versions version set copy = version.copy || jsonb_build_object('messaging', plan_item -> 'messaging')
from public.content_items item
join public.campaigns campaign on campaign.id = item.campaign_id
cross join lateral jsonb_array_elements(campaign.plan -> 'content') as plan_row(plan_item)
where version.content_item_id = item.id
  and plan_item ->> 'id' = item.id::text
  and plan_item ? 'messaging'
  and not (version.copy ? 'messaging');

create table public.messaging_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  legal_business_name text not null check (char_length(legal_business_name) between 1 and 160),
  physical_address text not null check (char_length(physical_address) between 5 and 500),
  default_country text not null default 'US' check (default_country in ('US', 'CA')),
  quiet_hours_start time not null default '20:00',
  quiet_hours_end time not null default '09:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email extensions.citext,
  phone_e164 text,
  first_name text,
  last_name text,
  country text check (country is null or country in ('US', 'CA')),
  timezone text,
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email is not null or phone_e164 is not null),
  check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$')
);
create unique index contacts_workspace_email_unique on public.contacts (workspace_id, lower(email::text)) where email is not null;
create unique index contacts_workspace_phone_unique on public.contacts (workspace_id, phone_e164) where phone_e164 is not null;

create table public.contact_lists (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table public.contact_list_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  list_id uuid not null references public.contact_lists(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (list_id, contact_id)
);

create table public.communication_consents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  channel text not null check (channel in ('email', 'sms')),
  status text not null check (status in ('subscribed', 'unsubscribed')),
  legal_basis text not null default 'express' check (legal_basis = 'express'),
  source text not null check (char_length(source) between 1 and 200),
  proof jsonb not null default '{}'::jsonb,
  obtained_at timestamptz not null,
  updated_at timestamptz not null default now(),
  unique (workspace_id, contact_id, channel)
);

create table public.consent_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  channel text not null check (channel in ('email', 'sms')),
  event_type text not null check (event_type in ('subscribed', 'unsubscribed', 'resubscribed', 'provider_suppressed')),
  source text not null,
  proof jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.suppressions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  channel text not null check (channel in ('email', 'sms')),
  reason text not null check (reason in ('user_opt_out', 'provider_unsubscribe', 'spam_report', 'hard_bounce', 'invalid_recipient', 'admin')),
  provider_key text,
  provider_event_id text,
  created_at timestamptz not null default now(),
  unique (workspace_id, contact_id, channel)
);

create table public.message_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  content_version_id uuid not null references public.content_versions(id) on delete cascade,
  provider_account_id uuid not null references public.provider_accounts(id),
  list_id uuid not null references public.contact_lists(id),
  channel text not null check (channel in ('email', 'sms')),
  status text not null default 'queued' check (status in ('queued', 'preparing', 'sending', 'sent', 'cancelled', 'failed', 'needs_attention')),
  scheduled_for timestamptz not null,
  idempotency_key text not null unique,
  eligible_count integer not null default 0,
  accepted_count integer not null default 0,
  delivered_count integer not null default 0,
  failed_count integer not null default 0,
  suppressed_count integer not null default 0,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.message_deliveries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  batch_id uuid not null references public.message_batches(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  channel text not null check (channel in ('email', 'sms')),
  status text not null default 'queued' check (status in ('queued', 'sending', 'accepted', 'delivered', 'opened', 'clicked', 'deferred', 'failed', 'bounced', 'unsubscribed', 'suppressed')),
  provider_message_id text,
  provider_request_id text,
  error_code text,
  error_message text,
  accepted_at timestamptz,
  delivered_at timestamptz,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, contact_id)
);
create unique index message_deliveries_provider_message_unique
  on public.message_deliveries (workspace_id, provider_message_id)
  where provider_message_id is not null;

create table public.message_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  delivery_id uuid references public.message_deliveries(id) on delete cascade,
  provider_key text not null check (provider_key in ('twilio_messaging', 'sendgrid_email')),
  provider_event_id text not null,
  event_type text not null,
  occurred_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider_key, provider_event_id)
);

create table private.unsubscribe_tokens (
  token_hash text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  channel text not null check (channel in ('email', 'sms')),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
revoke all on private.unsubscribe_tokens from public, anon, authenticated;
grant all on private.unsubscribe_tokens to service_role;

create index contacts_workspace_idx on public.contacts(workspace_id, created_at desc);
create index contact_list_members_contact_idx on public.contact_list_members(contact_id);
create index consent_eligibility_idx on public.communication_consents(workspace_id, channel, status, contact_id);
create index message_batches_due_idx on public.message_batches(status, scheduled_for);
create index message_deliveries_batch_status_idx on public.message_deliveries(batch_id, status);

create or replace function private.refresh_message_batch_counts()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.message_batches set
    accepted_count = (select count(*) from public.message_deliveries where batch_id = new.batch_id and status in ('accepted','delivered','opened','clicked')),
    delivered_count = (select count(*) from public.message_deliveries where batch_id = new.batch_id and status in ('delivered','opened','clicked')),
    failed_count = (select count(*) from public.message_deliveries where batch_id = new.batch_id and status in ('failed','bounced')),
    suppressed_count = (select count(*) from public.message_deliveries where batch_id = new.batch_id and status in ('suppressed','unsubscribed')),
    updated_at = now()
  where id = new.batch_id;
  return new;
end;
$$;
create trigger message_delivery_counts after insert or update of status on public.message_deliveries
for each row execute function private.refresh_message_batch_counts();

alter table public.messaging_settings enable row level security;
alter table public.contacts enable row level security;
alter table public.contact_lists enable row level security;
alter table public.contact_list_members enable row level security;
alter table public.communication_consents enable row level security;
alter table public.consent_events enable row level security;
alter table public.suppressions enable row level security;
alter table public.message_batches enable row level security;
alter table public.message_deliveries enable row level security;
alter table public.message_events enable row level security;

create policy messaging_settings_marketer_all on public.messaging_settings for all
  using (public.has_workspace_role(workspace_id, array['owner','admin','marketer']::public.workspace_role[]))
  with check (public.has_workspace_role(workspace_id, array['owner','admin','marketer']::public.workspace_role[]));

do $$
declare table_name text;
begin
  foreach table_name in array array['contacts','contact_lists','contact_list_members','communication_consents','suppressions']
  loop
    execute format('create policy %I_marketer_all on public.%I for all using (public.has_workspace_role(workspace_id, array[''owner'',''admin'',''marketer'']::public.workspace_role[])) with check (public.has_workspace_role(workspace_id, array[''owner'',''admin'',''marketer'']::public.workspace_role[]))', table_name, table_name);
  end loop;
  foreach table_name in array array['message_batches','message_deliveries','message_events']
  loop
    execute format('create policy %I_member_select on public.%I for select using (public.is_workspace_member(workspace_id))', table_name, table_name);
  end loop;
end $$;

create policy consent_events_marketer_select on public.consent_events for select
  using (public.has_workspace_role(workspace_id, array['owner','admin','marketer']::public.workspace_role[]));
create policy consent_events_marketer_insert on public.consent_events for insert
  with check (public.has_workspace_role(workspace_id, array['owner','admin','marketer']::public.workspace_role[]));

select pgmq.create('messaging_delivery');

create or replace function private.import_marketing_contacts(
  target_workspace_id uuid,
  target_user_id uuid,
  list_name text,
  input_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_list_id uuid;
  row_data jsonb;
  target_contact_id uuid;
  channel_name text;
  imported_count integer := 0;
  source_name text;
  consent_time timestamptz;
  consent_record_id uuid;
begin
  if not exists (
    select 1 from public.memberships
    where workspace_id = target_workspace_id and user_id = target_user_id
      and role in ('owner','admin','marketer')
  ) then raise exception 'workspace role required'; end if;
  if jsonb_typeof(input_rows) <> 'array' or jsonb_array_length(input_rows) < 1 or jsonb_array_length(input_rows) > 10000
    then raise exception 'contact import must contain 1 to 10000 rows'; end if;

  insert into public.contact_lists (workspace_id, name, created_by)
  values (target_workspace_id, trim(list_name), target_user_id)
  on conflict (workspace_id, name) do update set updated_at = now()
  returning id into target_list_id;

  for row_data in select value from jsonb_array_elements(input_rows)
  loop
    if coalesce((row_data->>'explicitConsent')::boolean, false) is not true
      then raise exception 'every imported row requires explicit consent proof'; end if;
    source_name := nullif(trim(row_data->>'consentSource'), '');
    consent_time := nullif(row_data->>'consentTimestamp', '')::timestamptz;
    if source_name is null or consent_time is null or consent_time > now()
      then raise exception 'every imported row requires a valid consent source and timestamp'; end if;
    if coalesce(jsonb_array_length(row_data->'consentChannels'), 0) < 1
      then raise exception 'every imported row requires at least one consent channel'; end if;

    target_contact_id := null;
    if nullif(lower(trim(row_data->>'email')), '') is not null then
      select id into target_contact_id from public.contacts
      where workspace_id = target_workspace_id and lower(email::text) = lower(trim(row_data->>'email'));
    end if;
    if target_contact_id is null and nullif(trim(row_data->>'phone'), '') is not null then
      select id into target_contact_id from public.contacts
      where workspace_id = target_workspace_id and phone_e164 = trim(row_data->>'phone');
    end if;
    if target_contact_id is null then
      insert into public.contacts (workspace_id, email, phone_e164, first_name, last_name, country, timezone, attributes)
      values (
        target_workspace_id,
        nullif(lower(trim(row_data->>'email')), '')::extensions.citext,
        nullif(trim(row_data->>'phone'), ''),
        nullif(trim(row_data->>'firstName'), ''),
        nullif(trim(row_data->>'lastName'), ''),
        nullif(row_data->>'country', ''),
        nullif(row_data->>'timezone', ''),
        coalesce(row_data->'attributes', '{}'::jsonb)
      ) returning id into target_contact_id;
    else
      update public.contacts set
        email = coalesce(nullif(lower(trim(row_data->>'email')), '')::extensions.citext, email),
        phone_e164 = coalesce(nullif(trim(row_data->>'phone'), ''), phone_e164),
        first_name = coalesce(nullif(trim(row_data->>'firstName'), ''), first_name),
        last_name = coalesce(nullif(trim(row_data->>'lastName'), ''), last_name),
        country = coalesce(nullif(row_data->>'country', ''), country),
        timezone = coalesce(nullif(row_data->>'timezone', ''), timezone),
        attributes = attributes || coalesce(row_data->'attributes', '{}'::jsonb),
        updated_at = now()
      where id = target_contact_id;
    end if;
    insert into public.contact_list_members (workspace_id, list_id, contact_id)
    values (target_workspace_id, target_list_id, target_contact_id)
    on conflict do nothing;
    for channel_name in select value #>> '{}' from jsonb_array_elements(row_data->'consentChannels')
    loop
      if channel_name not in ('email','sms') then raise exception 'invalid consent channel'; end if;
      if channel_name = 'email' and nullif(row_data->>'email', '') is null then raise exception 'email consent requires an email address'; end if;
      if channel_name = 'sms' and nullif(row_data->>'phone', '') is null then raise exception 'sms consent requires a phone number'; end if;
      consent_record_id := null;
      insert into public.communication_consents (workspace_id, contact_id, channel, status, legal_basis, source, proof, obtained_at)
      values (target_workspace_id, target_contact_id, channel_name, 'subscribed', 'express', source_name, coalesce(row_data->'consentProof', '{}'::jsonb), consent_time)
      on conflict (workspace_id, contact_id, channel) do update set
        status = 'subscribed', source = excluded.source, proof = excluded.proof,
        obtained_at = excluded.obtained_at, updated_at = now()
        where public.communication_consents.status <> 'unsubscribed'
          and not exists (
            select 1 from public.suppressions
            where workspace_id = target_workspace_id and contact_id = target_contact_id and channel = channel_name
          )
      returning id into consent_record_id;
      if consent_record_id is not null then
        insert into public.consent_events (workspace_id, contact_id, channel, event_type, source, proof, occurred_at)
        values (target_workspace_id, target_contact_id, channel_name, 'subscribed', source_name, coalesce(row_data->'consentProof', '{}'::jsonb), consent_time);
      end if;
    end loop;
    imported_count := imported_count + 1;
  end loop;
  return jsonb_build_object('listId', target_list_id, 'importedCount', imported_count);
end;
$$;
revoke all on function private.import_marketing_contacts(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function private.import_marketing_contacts(uuid, uuid, text, jsonb) to service_role;
