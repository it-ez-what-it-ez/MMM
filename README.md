# GrowthOS Production V1

GrowthOS is an early-access campaign creation and delivery product for US and Canadian businesses. A marketer can create an account with Google or a verified email address, start from one of twelve curated bundles or an AI objective, resolve the campaign with real product/service media, inspect every channel-specific creative and delivery field, approve immutable versions, create paid provider resources paused, and explicitly launch. Email is delivered through Twilio SendGrid and SMS through Twilio Messaging Services, with explicit-consent lists, suppressions, signed callbacks, STOP/unsubscribe handling, and real delivery state.

The template library is powered by a tactic engine. A template is a ready-to-edit, timed campaign sequence—not a placeholder card. The built-in editor exposes the real email layout, SMS body and segment count, every carousel slide, social/ad creative, responsive Search assets, account, URL, and schedule before the marketer saves or approves anything. Uploaded product/service media replaces the template subject without being redrawn.

This repository contains no demo users, seeded workspace, simulated metrics, mock provider, or mock AI fallback. If production infrastructure is absent, the application says so and remains unavailable.

## V1 scope

Paid destinations:

- Meta static-image and carousel ads
- Google responsive Search and Display ads
- TikTok supported static carousel campaigns
- Reddit Ads
- ChatGPT Ads Early Access for approved Advertiser API accounts

Organic destinations:

- Facebook Pages
- Instagram professional accounts
- LinkedIn organization pages
- TikTok photo posts and photo carousels

WhatsApp, video, native lead forms, ecommerce catalogs, CRM/CDP sync, paid LinkedIn, and other ad networks are deliberately excluded from the current delivery engine. They may appear in the Integrations catalog as clearly labeled roadmap items, never as connectable or connected providers. See [INTEGRATIONS_ARCHITECTURE.md](./INTEGRATIONS_ARCHITECTURE.md).

Before onboarding customers, complete [PROVIDER_ONBOARDING.md](./PROVIDER_ONBOARDING.md) and [PRODUCTION_LAUNCH_CHECKLIST.md](./PRODUCTION_LAUNCH_CHECKLIST.md). Provider approvals, verified senders, production secrets, compliance registrations, and real smoke tests are external launch requirements; source code cannot grant them.

## Production stack

- React 19 App Router through Vinext and ChatGPT Sites hosting
- Supabase Auth, Postgres, Storage, Queues, Cron, and Edge Functions
- Row Level Security on every workspace-owned table
- AES-256-GCM encrypted provider credentials in a private schema with no browser grants
- OpenAI Responses API strict JSON Schema generation, `gpt-image-2` optional backgrounds, and moderation
- Real provider OAuth, account discovery, paused creation, preflight, activation, status, and reporting boundaries

## Local setup

Requirements: Node.js `>=22.13.0`, npm, and a Supabase development project. Do not point local development at production.

1. Install dependencies.

   ```bash
   npm install
   ```

2. Create three separate Supabase projects before accepting customer data: development, staging, and production. Apply [the V1 SQL migration](./supabase/migrations/202608230001_growthos_v1.sql) to development first.

   ```bash
   supabase link --project-ref YOUR_DEVELOPMENT_PROJECT
   supabase db push
   ```

   Add `private` to each project's exposed API schemas. The migration grants that
   schema only to `service_role` and explicitly revokes it from `anon` and
   `authenticated`; this lets server routes use encrypted credentials without
   making credential rows browser-readable.

3. Copy `.env.example` to an ignored `.env.local` or `.dev.vars` and configure at minimum:

   ```text
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
   SUPABASE_SECRET_KEY=
   PROVIDER_TOKEN_ENCRYPTION_KEY=
   APP_ORIGIN=http://localhost:3000
   NEXT_PUBLIC_APP_ORIGIN=http://localhost:3000
   ```

   Generate a 32-byte encryption key and encode it as base64 or 64 hexadecimal characters. Never reuse the same key across development, staging, and production.

4. Configure Supabase Auth:

   - enable email signup and Google signup for the early-access environment;
   - enable Google and email magic links;
   - add `http://localhost:3000/auth/callback` locally and the exact staging/production callback URLs;
   - configure Resend or another production SMTP provider before customer sign-in links and team invitations are sent;
   - use the platform admin API or Supabase dashboard to invite the first owner.

   Google sign-in requires a Web application OAuth client in Google Auth
   Platform. Configure these exact development values:

   ```text
   Authorized JavaScript origin: http://localhost:3000
   Authorized redirect URI: https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
   ```

   Add the production GrowthOS origin as an additional JavaScript origin. The
   Google callback remains the Supabase `/auth/v1/callback` URL. Save the Google
   client ID and secret in **Supabase → Authentication → Sign In / Providers →
   Google**, then enable the provider. GrowthOS reads Supabase's public auth
   readiness endpoint and does not present Google as usable until Supabase
   reports it enabled.

5. Start the app.

   ```bash
   npm run dev
   ```

Without the Supabase variables, `/` intentionally shows a production-setup gate instead of a fake workspace.

## Provider onboarding

GrowthOS must own an approved developer application for every OAuth provider. The customer's account does not replace the platform application.

The primary Integrations area groups sources and destinations into Data, Advertising, Messaging, and Social. Implemented providers use one real flow: prepare prerequisites, authorize, select exact destinations, and run a live provider verification. OAuth callbacks return directly to destination selection. The UI never equates a token with a production-ready channel, and roadmap catalog entries have no fake connect action.

For each environment:

1. Create the provider application and exact callback URL:

   ```text
   {APP_ORIGIN}/api/v1/oauth/{provider}/callback
   ```

2. Add application credentials to server-only environment variables.
3. Complete sandbox access, business verification, permissions review, and webhook setup.
4. Run a sandbox/production smoke test that creates only paused resources.
5. Update `platform_provider_readiness` through the platform-admin API.
6. Disable the provider kill switch only after the latest smoke test passes.

Customer connection buttons are disabled until all readiness checks pass. ChatGPT Ads is different: after GrowthOS receives partner access, each customer enters an account-scoped key from OpenAI Ads Manager; GrowthOS verifies it with `GET /ad_account` and encrypts it.

Reddit Ads and TikTok Ads currently have an additional source-level acceptance
gate. They cannot be enabled by changing a database flag until complete
profile/pixel or advertiser-format discovery and the full paused hierarchy have
been proven. They remain part of the V1 target, not a fake selectable connector.

## Durable jobs

The application records organic schedules and publish jobs in Postgres and
dispatches each due job through the private `organic_publishing` Supabase Queue.
Only `service_role` can call the queue wrappers; no queue schema or operation is
granted to browser roles. Configure Supabase Cron to invoke:

```text
POST {APP_ORIGIN}/api/v1/internal/publish-due
X-GrowthOS-Worker-Secret: {GROWTHOS_WORKER_SECRET}
```

Run it every minute. The bundled `publish-due` Edge Function forwards the
request with the server-only worker secret. The worker reads queue messages with
a visibility timeout, atomically claims the matching job ledger row, deletes a
message only after success or a durable replacement has been enqueued, retries
with exponential backoff, and moves exhausted jobs to `dead_letter`. Provider
request IDs and errors are persisted without credentials.

Schedule `sync-results` every 15 minutes to synchronize provider-reported paid
metrics, and `refresh-tokens` every 10 minutes to rotate expiring OAuth access
tokens. Schedule `reconcile-organic` every two minutes to resolve asynchronous
TikTok publishing status. Set `GROWTHOS_APP_ORIGIN` and the same 32+ character
`GROWTHOS_WORKER_SECRET` as Edge Function secrets.

## Security behavior

- OAuth state is one-time, user/workspace/provider scoped, hashed at rest, expires after ten minutes, and uses PKCE where supported.
- Provider secrets are available only through the service-role private schema.
- Website import blocks local/private addresses, checks DNS A/AAAA answers, manually validates redirects, stays same-site, accepts only HTML, and applies strict time/size/page limits.
- Private creative media is delivered through expiring, request-limited provider URLs; the storage bucket remains private.
- Uploads and AI inputs are moderated. An unavailable OpenAI API produces a real error and does not generate canned content.
- Approval is invalid when media, URL, account, budget, or provider-required fields are unresolved.
- TikTok Organic account discovery records the creator's current privacy and
  comment capabilities. The user must explicitly choose a listed privacy level;
  GrowthOS queries Creator Info again during publish preflight and blocks stale
  or disallowed settings.
- AI cannot approve, publish, activate, increase budgets, connect accounts, or delete content.
- Paid launch is a confirmation proposal bound to the exact campaign-plan hash. A changed campaign must be reviewed again.
- Activation failure stops remaining activation and attempts to pause every resource already activated in that batch.

## Validation

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

Real-provider acceptance additionally requires approved test accounts, paused production-resource creation, organic test-page publishing, token expiry/reconnect scenarios, billing and permission-loss failures, rate limits, redacted request/response logs, and a separately approved low-budget smoke test. A green local build does not replace provider review.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the system design and [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for delivery gates.
