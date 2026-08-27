-- GrowthOS Production V1
-- This migration intentionally creates no demo users, workspaces, campaigns, or metrics.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;
create extension if not exists pgmq cascade;

create schema if not exists private;
revoke all on schema private from anon, authenticated;
grant usage on schema private to service_role;
alter default privileges in schema private grant all on tables to service_role;

create type public.workspace_role as enum ('owner', 'admin', 'marketer', 'reviewer', 'viewer');
create type public.business_type as enum ('ecommerce', 'service');
create type public.approval_mode as enum ('solo', 'team');
create type public.campaign_status as enum ('draft', 'in_review', 'approved', 'deploying', 'scheduled', 'live', 'paused', 'completed', 'failed');
create type public.content_status as enum ('draft', 'in_review', 'approved', 'rejected', 'scheduled', 'published', 'failed');
create type public.operation_status as enum ('pending', 'running', 'succeeded', 'failed', 'compensating', 'needs_attention');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  business_type public.business_type not null,
  website_url text,
  timezone text not null default 'America/Toronto',
  currency text not null check (currency in ('USD', 'CAD')),
  approval_mode public.approval_mode not null default 'solo',
  monthly_spend_ceiling_cents bigint check (monthly_spend_ceiling_cents is null or monthly_spend_ceiling_cents >= 0),
  ai_monthly_limit integer not null default 50 check (ai_monthly_limit between 0 and 10000),
  storage_limit_bytes bigint not null default 1073741824 check (storage_limit_bytes > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email extensions.citext not null,
  role public.workspace_role not null default 'reviewer',
  invited_by uuid not null references auth.users(id),
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.brand_profiles (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  summary text,
  voice jsonb not null default '{}'::jsonb,
  colors jsonb not null default '[]'::jsonb,
  fonts jsonb not null default '[]'::jsonb,
  logo_media_id uuid,
  explicit_settings jsonb not null default '{}'::jsonb,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products_services (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind public.business_type not null,
  name text not null check (char_length(name) between 1 and 160),
  description text,
  price_cents bigint check (price_cents is null or price_cents >= 0),
  currency text check (currency is null or currency in ('USD', 'CAD')),
  landing_url text,
  metadata jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  product_service_id uuid references public.products_services(id) on delete set null,
  storage_path text not null unique,
  kind text not null check (kind in ('logo', 'product', 'service', 'brand', 'generated_background', 'rendered_creative')),
  filename text not null,
  content_type text not null,
  byte_size bigint not null check (byte_size > 0),
  width integer,
  height integer,
  sha256 text not null,
  alt_text text,
  moderation_status text not null default 'pending' check (moderation_status in ('pending', 'accepted', 'rejected')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.brand_profiles
  add constraint brand_profiles_logo_media_fk
  foreign key (logo_media_id) references public.media_assets(id) on delete set null;

create table public.website_imports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  requested_url text not null,
  status text not null check (status in ('queued', 'crawling', 'ready', 'confirmed', 'failed')),
  suggestions jsonb not null default '{}'::jsonb,
  crawled_urls text[] not null default '{}',
  error_code text,
  error_message text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.provider_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider_key text not null check (provider_key in ('meta_business', 'google_ads', 'ga4', 'tiktok_ads', 'tiktok_organic', 'reddit_ads', 'linkedin_pages', 'chatgpt_ads')),
  status text not null default 'pending' check (status in ('pending', 'connected', 'degraded', 'expired', 'revoked')),
  external_user_id text,
  granted_scopes text[] not null default '{}',
  token_expires_at timestamptz,
  health_checked_at timestamptz,
  health_error jsonb,
  connected_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider_key, external_user_id)
);

create table private.provider_credentials (
  connection_id uuid primary key references public.provider_connections(id) on delete cascade,
  ciphertext text not null,
  iv text not null,
  auth_tag text not null,
  key_version integer not null,
  updated_at timestamptz not null default now()
);
revoke all on private.provider_credentials from public, anon, authenticated;
grant all on private.provider_credentials to service_role;

create table private.media_delivery_tokens (
  token_hash text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  media_id uuid not null references public.media_assets(id) on delete cascade,
  provider_key text not null,
  expires_at timestamptz not null,
  request_count integer not null default 0,
  max_requests integer not null default 20,
  last_requested_at timestamptz,
  created_at timestamptz not null default now()
);
revoke all on private.media_delivery_tokens from public, anon, authenticated;
grant all on private.media_delivery_tokens to service_role;

create table public.provider_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connection_id uuid not null references public.provider_connections(id) on delete cascade,
  provider_key text not null,
  external_id text not null,
  account_type text not null,
  name text not null,
  currency text,
  timezone text,
  billing_status text,
  capabilities jsonb not null default '{}'::jsonb,
  selected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, external_id, account_type)
);

create table public.oauth_states (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_key text not null,
  state_hash text not null unique,
  pkce_verifier_ciphertext text,
  redirect_path text not null default '/app/manage/connections',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.campaign_templates (
  id text not null,
  version integer not null,
  name text not null,
  business_types text[] not null,
  goals text[] not null,
  channels text[] not null,
  manifest jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (id, version)
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  status public.campaign_status not null default 'draft',
  source text not null check (source in ('template', 'ai')),
  template_id text,
  template_version integer,
  objective text,
  product_service_id uuid references public.products_services(id) on delete set null,
  landing_url text not null,
  currency text not null check (currency in ('USD', 'CAD')),
  daily_budget_cents bigint check (daily_budget_cents is null or daily_budget_cents > 0),
  lifetime_budget_cents bigint check (lifetime_budget_cents is null or lifetime_budget_cents > 0),
  spend_ceiling_cents bigint check (spend_ceiling_cents is null or spend_ceiling_cents > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  plan jsonb not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (template_id, template_version) references public.campaign_templates(id, version)
);

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  channel_key text not null,
  format text not null,
  sort_order integer not null default 0,
  current_version_id uuid,
  status public.content_status not null default 'draft',
  created_at timestamptz not null default now()
);

create table public.content_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  version integer not null check (version > 0),
  copy jsonb not null,
  creative_scene jsonb not null,
  rendered_media_ids uuid[] not null default '{}',
  targeting jsonb not null default '{}'::jsonb,
  destination_url text,
  unresolved_fields text[] not null default '{}',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (content_item_id, version)
);

alter table public.content_items
  add constraint content_items_current_version_fk
  foreign key (current_version_id) references public.content_versions(id) on delete set null;

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  content_version_id uuid references public.content_versions(id) on delete cascade,
  decision text not null check (decision in ('approved', 'rejected', 'changes_requested')),
  comment text,
  decided_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  content_version_id uuid not null references public.content_versions(id) on delete cascade,
  provider_account_id uuid not null references public.provider_accounts(id),
  scheduled_for timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'queued', 'publishing', 'published', 'cancelled', 'failed')),
  publish_job_id uuid,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.operations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  kind text not null,
  idempotency_key text not null,
  status public.operation_status not null default 'pending',
  requested_by uuid not null references auth.users(id),
  request jsonb not null default '{}'::jsonb,
  result jsonb,
  error jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, idempotency_key)
);

create table public.campaign_deployments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  operation_id uuid not null references public.operations(id),
  provider_account_id uuid not null references public.provider_accounts(id),
  channel_key text not null,
  external_campaign_id text,
  external_resource_ids jsonb not null default '{}'::jsonb,
  status text not null check (status in ('validating', 'paused', 'active', 'pausing', 'paused_after_failure', 'needs_attention', 'failed', 'completed')),
  provider_request_id text,
  error jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (operation_id, provider_account_id, channel_key)
);

create table public.publish_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  schedule_id uuid not null unique references public.schedules(id) on delete cascade,
  idempotency_key text not null unique,
  status text not null default 'queued' check (status in ('queued', 'running', 'published', 'retrying', 'dead_letter', 'cancelled')),
  attempt_count integer not null default 0,
  max_attempts integer not null default 8,
  run_after timestamptz not null,
  external_post_id text,
  provider_request_id text,
  last_error jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.schedules
  add constraint schedules_publish_job_fk
  foreign key (publish_job_id) references public.publish_jobs(id) on delete set null;

create table public.metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  deployment_id uuid references public.campaign_deployments(id) on delete cascade,
  provider_key text not null,
  source_model text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  currency text,
  metrics jsonb not null,
  provider_report_id text,
  captured_at timestamptz not null default now(),
  unique (provider_key, provider_report_id, period_start, period_end)
);

create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  kind text not null,
  model text not null,
  prompt_version text not null,
  input_hash text not null,
  inputs jsonb not null,
  output jsonb,
  usage jsonb,
  moderation jsonb,
  status text not null check (status in ('running', 'succeeded', 'failed', 'rejected')),
  error jsonb,
  accepted_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id text,
  operation_id uuid references public.operations(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  ip_hash text,
  created_at timestamptz not null default now()
);

create table public.platform_provider_readiness (
  provider_key text not null,
  environment text not null check (environment in ('development', 'staging', 'production')),
  application_id text,
  configured boolean not null default false,
  review_status text not null default 'not_started' check (review_status in ('not_started', 'submitted', 'sandbox', 'approved', 'rejected')),
  required_scopes text[] not null default '{}',
  granted_scopes text[] not null default '{}',
  api_version text,
  redirect_verified boolean not null default false,
  webhook_verified boolean not null default false,
  last_smoke_test_at timestamptz,
  last_smoke_test_status text,
  token_refresh_healthy boolean not null default false,
  webhook_healthy boolean not null default false,
  kill_switch boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (provider_key, environment)
);

create index memberships_user_idx on public.memberships(user_id);
create index campaigns_workspace_status_idx on public.campaigns(workspace_id, status, updated_at desc);
create index content_items_campaign_idx on public.content_items(campaign_id, sort_order);
create index schedules_due_idx on public.schedules(status, scheduled_for);
create index publish_jobs_due_idx on public.publish_jobs(status, run_after);
create index metrics_campaign_period_idx on public.metric_snapshots(campaign_id, period_start desc);
create index audit_workspace_created_idx on public.audit_events(workspace_id, created_at desc);

create or replace function public.touch_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['profiles', 'workspaces', 'brand_profiles', 'products_services', 'provider_connections', 'provider_accounts', 'campaigns', 'campaign_deployments', 'publish_jobs', 'platform_provider_readiness']
  loop
    execute format('create trigger %I_touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()', table_name, table_name);
  end loop;
end $$;

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.workspace_id = target_workspace_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.has_workspace_role(target_workspace_id uuid, allowed_roles public.workspace_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.workspace_id = target_workspace_id
      and m.user_id = auth.uid()
      and m.role = any(allowed_roles)
  );
$$;

create or replace function public.within_workspace_storage_limit(
  target_workspace_id uuid,
  requested_bytes bigint
)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select sum(asset.byte_size) from public.media_assets asset
    where asset.workspace_id = target_workspace_id
  ), 0) + requested_bytes <= (
    select workspace.storage_limit_bytes from public.workspaces workspace
    where workspace.id = target_workspace_id
  );
$$;

create or replace function public.create_workspace(
  workspace_name text,
  workspace_slug text,
  workspace_business_type public.business_type,
  workspace_timezone text,
  workspace_currency text,
  workspace_website_url text default null,
  workspace_audit_event_id uuid default gen_random_uuid(),
  workspace_operation_id uuid default gen_random_uuid()
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_workspace_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  insert into public.workspaces (name, slug, business_type, timezone, currency, website_url, created_by)
  values (workspace_name, workspace_slug, workspace_business_type, workspace_timezone, workspace_currency, workspace_website_url, auth.uid())
  returning id into new_workspace_id;
  insert into public.memberships (workspace_id, user_id, role) values (new_workspace_id, auth.uid(), 'owner');
  insert into public.brand_profiles (workspace_id) values (new_workspace_id);
  insert into public.audit_events (id, workspace_id, actor_id, action, resource_type, resource_id, metadata)
  values (workspace_audit_event_id, new_workspace_id, auth.uid(), 'workspace.created', 'workspace', new_workspace_id::text, jsonb_build_object('operationId', workspace_operation_id));
  return new_workspace_id;
end;
$$;

create or replace function public.create_campaign_bundle(
  target_workspace_id uuid,
  campaign_id uuid,
  campaign_plan jsonb,
  campaign_source text,
  campaign_template_id text,
  campaign_template_version integer,
  operation_id uuid,
  audit_event_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare item jsonb;
declare item_index integer := 0;
declare content_item_id uuid;
declare content_version_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not exists (
    select 1 from public.memberships membership
    where membership.workspace_id = target_workspace_id
      and membership.user_id = auth.uid()
      and membership.role in ('owner', 'admin', 'marketer')
  ) then raise exception 'workspace campaign permission required'; end if;

  insert into public.campaigns (
    id, workspace_id, name, status, source, template_id, template_version,
    objective, product_service_id, landing_url, currency,
    daily_budget_cents, lifetime_budget_cents, starts_at, ends_at, plan, created_by
  ) values (
    campaign_id, target_workspace_id, campaign_plan ->> 'name', 'draft',
    campaign_source, campaign_template_id, campaign_template_version,
    campaign_plan ->> 'objective', (campaign_plan ->> 'productServiceId')::uuid,
    campaign_plan ->> 'landingUrl', campaign_plan ->> 'currency',
    nullif(campaign_plan ->> 'dailyBudgetCents', '')::bigint,
    nullif(campaign_plan ->> 'lifetimeBudgetCents', '')::bigint,
    (campaign_plan ->> 'startsAt')::timestamptz,
    nullif(campaign_plan ->> 'endsAt', '')::timestamptz,
    campaign_plan, auth.uid()
  );
  insert into public.operations (
    id, workspace_id, campaign_id, kind, idempotency_key, status,
    requested_by, request, result, started_at, completed_at
  ) values (
    operation_id, target_workspace_id, campaign_id, 'campaign.create',
    'campaign-create:' || campaign_id::text, 'succeeded', auth.uid(),
    jsonb_build_object('source', campaign_source),
    jsonb_build_object('campaignId', campaign_id), now(), now()
  );

  for item in select value from jsonb_array_elements(campaign_plan -> 'content') loop
    content_item_id := (item ->> 'id')::uuid;
    content_version_id := gen_random_uuid();
    insert into public.content_items (
      id, workspace_id, campaign_id, channel_key, format, sort_order, status
    ) values (
      content_item_id, target_workspace_id, campaign_id,
      item ->> 'channel', item ->> 'format', item_index, 'draft'
    );
    insert into public.content_versions (
      id, workspace_id, content_item_id, version, copy, creative_scene,
      rendered_media_ids, targeting, destination_url, unresolved_fields, created_by
    ) values (
      content_version_id, target_workspace_id, content_item_id, 1,
      jsonb_build_object(
        'headline', item ->> 'headline', 'body', item ->> 'body',
        'cta', item ->> 'cta',
        'carouselSlides', coalesce(item -> 'carouselSlides', '[]'::jsonb),
        'searchHeadlines', item -> 'searchHeadlines',
        'searchDescriptions', item -> 'searchDescriptions',
        'searchKeywords', item -> 'searchKeywords',
        'publishingOptions', item -> 'publishingOptions',
        'messaging', item -> 'messaging'
      ),
      coalesce(item -> 'scene', '{}'::jsonb),
      array(select jsonb_array_elements_text(coalesce(item -> 'mediaIds', '[]'::jsonb))::uuid),
      coalesce(item -> 'targeting', '{}'::jsonb),
      item ->> 'destinationUrl',
      array(select jsonb_array_elements_text(coalesce(item -> 'unresolvedFields', '[]'::jsonb))),
      auth.uid()
    );
    update public.content_items set current_version_id = content_version_id
      where id = content_item_id;
    item_index := item_index + 1;
  end loop;

  insert into public.audit_events (
    id, workspace_id, actor_id, action, resource_type, resource_id, operation_id, metadata
  ) values (
    audit_event_id, target_workspace_id, auth.uid(), 'campaign.created',
    'campaign', campaign_id::text, operation_id,
    jsonb_build_object('source', campaign_source, 'channels', campaign_plan -> 'channels')
  );
  return campaign_id;
end;
$$;

grant execute on function public.create_workspace(text, text, public.business_type, text, text, text, uuid, uuid) to authenticated;
grant execute on function public.create_campaign_bundle(uuid, uuid, jsonb, text, text, integer, uuid, uuid) to authenticated;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.has_workspace_role(uuid, public.workspace_role[]) to authenticated;
grant execute on function public.within_workspace_storage_limit(uuid, bigint) to authenticated;

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare pending_workspace uuid;
declare pending_role public.workspace_role;
declare pending_invitation uuid;
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)), new.raw_user_meta_data ->> 'avatar_url')
  on conflict (id) do nothing;
  begin pending_invitation := nullif(new.raw_user_meta_data ->> 'invitation_id', '')::uuid;
  exception when others then pending_invitation := null; end;
  if pending_invitation is not null then
    select invitation.workspace_id, invitation.role
      into pending_workspace, pending_role
      from public.invitations invitation
      where invitation.id = pending_invitation
        and lower(invitation.email::text) = lower(new.email)
        and invitation.accepted_at is null
        and invitation.expires_at > now();
  end if;
  if pending_workspace is not null then
    insert into public.memberships (workspace_id, user_id, role)
    values (pending_workspace, new.id, pending_role)
    on conflict (workspace_id, user_id) do nothing;
    update public.invitations set accepted_at = now()
      where id = pending_invitation and accepted_at is null;
  end if;
  return new;
end;
$$;

create or replace function public.claim_pending_invitations()
returns integer language plpgsql security definer set search_path = '' as $$
declare claimed integer := 0;
declare current_email text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select user_record.email into current_email
  from auth.users user_record where user_record.id = auth.uid();
  if current_email is null then return 0; end if;

  insert into public.memberships (workspace_id, user_id, role)
  select invitation.workspace_id, auth.uid(), invitation.role
  from public.invitations invitation
  where lower(invitation.email::text) = lower(current_email)
    and invitation.accepted_at is null
    and invitation.expires_at > now()
  on conflict (workspace_id, user_id) do nothing;

  update public.invitations invitation
  set accepted_at = now()
  where lower(invitation.email::text) = lower(current_email)
    and invitation.accepted_at is null
    and invitation.expires_at > now();
  get diagnostics claimed = row_count;
  return claimed;
end;
$$;
grant execute on function public.claim_pending_invitations() to authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

alter table public.profiles enable row level security;
create policy profiles_self_select on public.profiles for select using (id = auth.uid());
create policy profiles_self_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

alter table public.workspaces enable row level security;
create policy workspaces_member_select on public.workspaces for select using (public.is_workspace_member(id));
create policy workspaces_admin_update on public.workspaces for update using (public.has_workspace_role(id, array['owner','admin']::public.workspace_role[]));

alter table public.memberships enable row level security;
create policy memberships_member_select on public.memberships for select using (public.is_workspace_member(workspace_id));
create policy memberships_admin_insert on public.memberships for insert with check (public.has_workspace_role(workspace_id, array['owner','admin']::public.workspace_role[]));
create policy memberships_admin_update on public.memberships for update using (public.has_workspace_role(workspace_id, array['owner','admin']::public.workspace_role[]));
create policy memberships_admin_delete on public.memberships for delete using (public.has_workspace_role(workspace_id, array['owner','admin']::public.workspace_role[]));

-- Workspace tables: every row is isolated by membership. Mutations are role-restricted.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'invitations','brand_profiles','products_services','media_assets','website_imports',
    'provider_connections','provider_accounts','oauth_states','campaigns','content_items',
    'content_versions','approvals','schedules','operations','campaign_deployments','publish_jobs',
    'metric_snapshots','ai_runs','audit_events'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('create policy %I_member_select on public.%I for select using (public.is_workspace_member(workspace_id))', table_name, table_name);
  end loop;
end $$;

create policy invitations_admin_all on public.invitations for all
  using (public.has_workspace_role(workspace_id, array['owner','admin']::public.workspace_role[]))
  with check (public.has_workspace_role(workspace_id, array['owner','admin']::public.workspace_role[]));
create policy brand_profiles_marketer_all on public.brand_profiles for all
  using (public.has_workspace_role(workspace_id, array['owner','admin','marketer']::public.workspace_role[]))
  with check (public.has_workspace_role(workspace_id, array['owner','admin','marketer']::public.workspace_role[]));
create policy products_services_marketer_all on public.products_services for all
  using (public.has_workspace_role(workspace_id, array['owner','admin','marketer']::public.workspace_role[]))
  with check (public.has_workspace_role(workspace_id, array['owner','admin','marketer']::public.workspace_role[]));
create policy media_assets_marketer_insert on public.media_assets for insert
  with check (
    public.has_workspace_role(workspace_id, array['owner','admin','marketer']::public.workspace_role[])
    and public.within_workspace_storage_limit(workspace_id, byte_size)
  );
create policy media_assets_marketer_update on public.media_assets for update
  using (public.has_workspace_role(workspace_id, array['owner','admin','marketer']::public.workspace_role[]))
  with check (public.has_workspace_role(workspace_id, array['owner','admin','marketer']::public.workspace_role[]));
create policy media_assets_marketer_delete on public.media_assets for delete
  using (public.has_workspace_role(workspace_id, array['owner','admin','marketer']::public.workspace_role[]));
create policy website_imports_marketer_all on public.website_imports for all
  using (public.has_workspace_role(workspace_id, array['owner','admin','marketer']::public.workspace_role[]))
  with check (public.has_workspace_role(workspace_id, array['owner','admin','marketer']::public.workspace_role[]));
create policy provider_connections_admin_all on public.provider_connections for all
  using (public.has_workspace_role(workspace_id, array['owner','admin']::public.workspace_role[]))
  with check (public.has_workspace_role(workspace_id, array['owner','admin']::public.workspace_role[]));
create policy provider_accounts_admin_all on public.provider_accounts for all
  using (public.has_workspace_role(workspace_id, array['owner','admin']::public.workspace_role[]))
  with check (public.has_workspace_role(workspace_id, array['owner','admin']::public.workspace_role[]));
create policy oauth_states_owner_all on public.oauth_states for all using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$
declare table_name text;
begin
  foreach table_name in array array['campaigns','content_items','content_versions','schedules'] loop
    execute format('create policy %I_marketer_all on public.%I for all using (public.has_workspace_role(workspace_id, array[''owner'',''admin'',''marketer'']::public.workspace_role[])) with check (public.has_workspace_role(workspace_id, array[''owner'',''admin'',''marketer'']::public.workspace_role[]))', table_name, table_name);
  end loop;
end $$;

create policy approvals_reviewer_insert on public.approvals for insert
  with check (public.has_workspace_role(workspace_id, array['owner','admin','reviewer']::public.workspace_role[]) and decided_by = auth.uid());

-- Operations and provider results are created only by trusted server/Edge Function roles.
-- Authenticated clients can read them through the membership policies above.

alter table public.campaign_templates enable row level security;
create policy templates_authenticated_read on public.campaign_templates for select to authenticated using (active = true);

alter table public.platform_provider_readiness enable row level security;
create policy readiness_authenticated_read on public.platform_provider_readiness for select to authenticated using (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'growthos-private-media',
  'growthos-private-media',
  false,
  20971520,
  array['image/jpeg','image/png','image/webp','image/gif','application/pdf']
)
on conflict (id) do update set public = false;

create policy media_object_member_read on storage.objects for select to authenticated
using (
  bucket_id = 'growthos-private-media'
  and public.is_workspace_member((storage.foldername(name))[1]::uuid)
);
create policy media_object_marketer_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'growthos-private-media'
  and public.has_workspace_role((storage.foldername(name))[1]::uuid, array['owner','admin','marketer']::public.workspace_role[])
  and coalesce((metadata ->> 'size')::bigint, 0) between 1 and 20971520
  and public.within_workspace_storage_limit(
    (storage.foldername(name))[1]::uuid,
    coalesce((metadata ->> 'size')::bigint, 0)
  )
);
create policy media_object_marketer_update on storage.objects for update to authenticated
using (
  bucket_id = 'growthos-private-media'
  and public.has_workspace_role((storage.foldername(name))[1]::uuid, array['owner','admin','marketer']::public.workspace_role[])
);
create policy media_object_marketer_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'growthos-private-media'
  and public.has_workspace_role((storage.foldername(name))[1]::uuid, array['owner','admin','marketer']::public.workspace_role[])
);

select pgmq.create('provider_operations');
select pgmq.create('organic_publishing');
select pgmq.create('reporting_sync');

-- Server-only queue wrappers. The pgmq tables and functions are never exposed
-- to browser roles; only service_role can dispatch and consume work.
create or replace function private.queue_send(
  target_queue text,
  payload jsonb,
  delay_seconds integer default 0
)
returns bigint language sql security definer set search_path = '' as $$
  select pgmq.send(target_queue, payload, greatest(delay_seconds, 0));
$$;

create or replace function private.queue_read(
  target_queue text,
  visibility_seconds integer,
  quantity integer
)
returns table (
  msg_id bigint,
  read_ct integer,
  enqueued_at timestamptz,
  vt timestamptz,
  message jsonb
) language sql security definer set search_path = '' as $$
  select queued.msg_id, queued.read_ct, queued.enqueued_at, queued.vt, queued.message
  from pgmq.read(target_queue, greatest(visibility_seconds, 1), greatest(quantity, 1)) queued;
$$;

create or replace function private.queue_delete(
  target_queue text,
  target_message_id bigint
)
returns boolean language sql security definer set search_path = '' as $$
  select pgmq.delete(target_queue, target_message_id);
$$;

revoke all on function private.queue_send(text, jsonb, integer) from public, anon, authenticated;
revoke all on function private.queue_read(text, integer, integer) from public, anon, authenticated;
revoke all on function private.queue_delete(text, bigint) from public, anon, authenticated;
grant execute on function private.queue_send(text, jsonb, integer) to service_role;
grant execute on function private.queue_read(text, integer, integer) to service_role;
grant execute on function private.queue_delete(text, bigint) to service_role;
