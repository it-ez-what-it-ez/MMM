-- Preserve tactic identity, schedule, and editor state in every immutable
-- content version created with a campaign bundle.
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
        'templateStepId', item -> 'templateStepId',
        'stepLabel', item -> 'stepLabel',
        'tacticStage', item -> 'tacticStage',
        'headline', item ->> 'headline',
        'body', item ->> 'body',
        'cta', item ->> 'cta',
        'carouselSlides', coalesce(item -> 'carouselSlides', '[]'::jsonb),
        'searchHeadlines', item -> 'searchHeadlines',
        'searchDescriptions', item -> 'searchDescriptions',
        'searchKeywords', item -> 'searchKeywords',
        'publishingOptions', item -> 'publishingOptions',
        'messaging', item -> 'messaging',
        'scheduledFor', item -> 'scheduledFor',
        'design', item -> 'design'
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

grant execute on function public.create_campaign_bundle(uuid, uuid, jsonb, text, text, integer, uuid, uuid) to authenticated;
