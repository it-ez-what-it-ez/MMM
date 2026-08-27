# GrowthOS Production V1 delivery gates

## Implemented in this repository

- Supabase Auth entry, invite-only workspace creation, memberships, roles, RLS, private Storage, audit events, credential encryption, and global platform readiness
- Empty production state with all Northstar/demo sessions, D1/R2 bindings, runtime mocks, mock AI, and seeded metrics removed
- Five-destination application shell and four-tab campaign workspace
- Twelve versioned tactic manifests with 4–8 timed steps, complete-sequence previews, editable design blocks, real product substitution, email/SMS layouts, carousels, and channel-specific schedules
- Real product/service records, private image upload, OpenAI image moderation, safe website suggestions, and explicit confirmation
- OpenAI strict-schema campaign planning with no fallback
- Exact Facebook/Instagram/TikTok/LinkedIn/Meta/Google/Reddit/ChatGPT preview fields, including carousel slides, account, budget, URL, targeting, and schedule
- Server-enforced approval blockers, solo/team approval mode, immutable version records, and audited decisions
- Provider OAuth state, PKCE, callback exchange, account discovery, account selection, encrypted credentials, and ChatGPT Ads key verification
- Real paid and organic adapter contracts and provider HTTP implementations behind readiness kill switches; Reddit and TikTok Ads have an additional non-bypassable implementation gate until their complete per-account resource hierarchy passes acceptance
- Paid preflight, hash-bound launch confirmation, paused resource creation, activation, idempotency, and compensating pause
- Durable organic schedules dispatched through a private Supabase Queue, retries, dead-letter handling, reconciliation, and expiring provider media delivery
- Platform-admin readiness screen for application IDs, scopes, review evidence, callbacks, webhooks, smoke tests, refresh health, and kill switches
- Per-content approve, reject, and request-changes decisions with team separation and automatic unscheduling
- Team invitations and workspace spend/approval settings

## External gates before design-partner access

These cannot be completed from source code alone and must remain disabled until evidence is recorded:

1. Create development, staging, and production Supabase projects; apply migrations; configure Pro backups/availability for production.
2. Configure production SMTP and test invitation/magic-link deliverability.
3. Choose the permanent domain and freeze callback/webhook URLs.
4. Submit and obtain Meta advanced permissions and business verification.
5. Obtain Google Ads production developer-token access and approve the OAuth consent app.
6. Obtain TikTok Business Marketing API access plus Login Kit/Content Posting audit approval.
7. Create the verified Reddit Business developer app with `adsread`/`adsedit`.
8. Obtain LinkedIn Community Management access.
9. Obtain OpenAI Advertiser API partner access.
10. Configure Sentry and redaction, worker Cron, provider webhooks, reconciliation polling, and alerting.
11. Finish and prove Reddit profile/pixel selection plus ad-group/post/ad creation, and TikTok advertiser identity/format discovery plus ad-group/creative/ad creation. Their connection buttons are hard-disabled in source until then.

## Mandatory acceptance evidence

- RLS isolation using two real users in different workspaces
- invitation, Google login, magic link, refresh, and logout
- OAuth expiry, replay rejection, refresh, revocation, permission loss, and reconnect
- paused resource creation and provider IDs for each paid adapter
- test Page/profile publishing for each organic adapter
- billing, rate-limit, invalid creative, provider rejection, and deleted-resource diagnostics
- activation compensation, including a forced compensation failure and urgent operator state
- reporting sync with source/attribution labels and no invalid currency aggregation
- desktop/mobile keyboard and touch journeys
- typecheck, lint, migrations, unit, Playwright, security, queue reconciliation, and production build

No real spend is permitted until a separate human approves a low-budget production smoke test. Public Sites sharing must not be enabled until these gates pass and the user explicitly approves publication.
