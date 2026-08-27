# GrowthOS Production V1 architecture

Email and SMS use customer-owned Twilio SendGrid and Twilio Messaging Service connections. Contacts, channel-specific express consent, immutable consent events, suppressions, batches, per-recipient deliveries, and provider events are workspace-isolated Postgres records. The `messaging_delivery` PGMQ queue is consumed in bounded chunks by the `send-messages` Edge Function. SendGrid Event Webhooks use ECDSA verification; Twilio callbacks use the exact public URL, form body, and `X-Twilio-Signature`. Email uses an inline CID attachment for the approved product image so private Storage objects never become permanent public URLs.

## Product boundary

GrowthOS V1 has five destinations: Home, Campaigns, Calendar, Results, and Manage. A campaign has Review, Schedule, Delivery, and Results tabs. The UI deliberately keeps provider administration, assets, team access, and workspace limits outside the daily flow.

```text
Invite → Workspace → Brand/product → Real connection
                                   ↓
Template or AI → Exact previews → Human approval
                                   ↓
Paid preflight → Paused resources → Final confirmation → Activation
Organic approval → Durable schedule → Publish worker → Reconciliation
                                   ↓
                         Provider-native results
```

## Trust boundaries

The browser uses Supabase Auth and the public publishable key. Postgres Row Level Security isolates workspace data for every authenticated read. Consequential operations go through server routes that validate the bearer session, re-check workspace roles with the service role, write an operation and audit event, and then call the provider.

Provider credentials are JSON-encrypted with AES-256-GCM using a unique 96-bit IV. Ciphertext, IV, tag, and key version live in `private.provider_credentials`; `anon` and `authenticated` have no schema/table grant. Private Storage paths begin with the workspace UUID and storage policies re-check membership.

## Data model

The migration covers profiles, workspaces, memberships, invitations, brand profiles, products/services, media, website imports, provider connections/accounts, OAuth states, templates, campaigns, content items and immutable versions, approvals, schedules, deployments, operations, metric snapshots, AI runs, publish jobs, provider readiness, and audit events.

There are no customer seeds. The bundled template manifests are versioned application artifacts and are upserted into the global template table when first used.

## Campaign and approval invariants

- A campaign plan contains exact channel copy, resolved media IDs, carousel slides, destination URL, target summary, selected account, currency, budget, and dates.
- Every uploaded subject layer has `preserveOriginal: true`; optional generation is limited to backgrounds.
- Approval is rejected while any unresolved field exists, any destination account is missing, any non-Search creative lacks media, or selected media has not passed moderation.
- Approved content versions are immutable. Editing must create a new version and return the item to draft, invalidating approval.
- Solo workspaces allow owner self-approval. Team workspaces reject approval by the campaign creator.

## Real integrations

`ConnectionAdapter`, `PaidAdsAdapter`, `OrganicPublisherAdapter`, `MeasurementAdapter`, and `AIProvider` are server-only contracts. Production code contains no test double.

OAuth providers use one-time hashed state and PKCE where supported. Callback exchange, refresh credentials, account discovery, and health results occur server-side. A readiness record plus actual environment configuration gates each connection button; production additionally requires approved review status, verified redirect, a passed smoke test, and a disabled kill switch.

Paid adapters validate against the real account before resource creation. The launch route reruns preflight, creates all resources paused, persists provider IDs, and only then activates. Any failure halts the batch. Activated resources are paused in reverse order; an unsuccessful compensation becomes `needs_attention`.

Organic publishing uses the private Supabase `organic_publishing` PGMQ queue plus durable `publish_jobs` ledger rows. The queue provides delayed visibility and redelivery; the ledger provides workspace ownership, idempotency, attempts, provider IDs, diagnostics, and user-visible state. The worker atomically claims the ledger row, validates and publishes the approved version, and deletes the queue message only after success or durable retry replacement. Dead-letter state is visible and auditable.

## AI boundary

The OpenAI implementation uses the Responses API with strict JSON Schema output. Inputs are moderated before planning; uploaded images are moderated before approval or provider delivery. Every AI run stores its model, prompt version, input hash, inputs, structured output, usage, moderation result, status, and acceptance. There is no silent or canned fallback.

AI is draft-only. Approval, connection, deletion, publishing, ad activation, and budget changes require authorized server mutations and explicit human confirmation.

## Website and media safety

Website import resolves A and AAAA records through DNS-over-HTTPS and rejects local, loopback, link-local, private, and reserved targets. Redirects are manual, capped, revalidated, and same-site. Only HTML is accepted, with an eight-second fetch timeout, two-megabyte page cap, and five-page crawl limit. Scripts/styles are never executed, and extracted suggestions require confirmation.

Storage remains private. Providers receive expiring GrowthOS URLs backed by hashed, request-limited delivery tokens. Each request is logged and the URL stops serving after expiry or request exhaustion.

## Environment separation

Development, staging, and production need separate Supabase projects, storage buckets, provider apps, secrets, OAuth callbacks, webhooks, encryption keys, OpenAI projects, worker secrets, and alerting. Production provider switches stay off until platform review and smoke-test evidence are recorded.
