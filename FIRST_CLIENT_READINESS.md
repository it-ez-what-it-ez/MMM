# GrowthOS first-client readiness

Last audited: August 29, 2026.

## Launch decision

GrowthOS is **not ready to invite the first client today**. The application is a real production codebase—not a seeded demo—but the production services and provider applications have not completed their activation and acceptance gates. The app must continue to hide connection actions until those gates are satisfied.

The fastest responsible launch is a design-partner release with **Meta, Google Ads, SendGrid email, and Twilio SMS** as the required delivery set. GA4 and Meta organic can join that release when their shared provider reviews pass. TikTok Ads, Reddit Ads, TikTok organic, LinkedIn Pages, and ChatGPT Ads remain Early Access until their independent external approvals and smoke tests pass.

## Audited production state

| Area                | Current state                                                                                                                           | Launch action                                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Application         | Real Supabase-backed product; no runtime mock provider or seeded client data                                                            | Deploy this audited revision and run the final browser journey                                                                     |
| Supabase schema     | All repository migrations are applied to the current project                                                                            | Create separate staging and production projects before accepting client data                                                       |
| Supabase Auth       | Email and Google are enabled; the Site URL and callback allowlist point at the current hosted origin                                    | Retest signup, magic link, Google callback, invitation, refresh, and logout after the next application deployment                  |
| Auth email          | Supabase custom SMTP is not configured                                                                                                  | Add a domain-authenticated SMTP provider and test every auth email                                                                 |
| Database protection | RLS and private credential schema are implemented                                                                                       | Upgrade from the Free plan, enable production backups, and perform a restore drill                                                 |
| Secrets             | The database password is rotated into the local login Keychain; Sites uses a modern secret key; legacy API keys are disabled            | Create independent credentials for staging and production and never reuse the retired setup credentials                            |
| Database transport  | SSL is required for external Postgres connections                                                                                       | Add production network restrictions after the permanent deployment egress strategy is known                                        |
| Durable jobs        | Five authenticated Edge Functions and five Vault-backed Cron schedules are deployed; all five returned live 200 heartbeats on August 29 | Prove retry, dead-letter visibility, and reconciliation with controlled failure fixtures                                           |
| Data API            | `private` is allowlisted for trusted server operations; automatic new-table grants are off; a publishable-key probe is denied           | Keep private tables and functions explicitly revoked from browser roles and re-audit grants after every migration                  |
| AI                  | Real OpenAI Responses, Images, and Moderation paths exist with no mock fallback                                                         | Create a funded production OpenAI project, add its API key, set limits, and run structured-output/moderation failure tests         |
| Monitoring          | Client/server Sentry instrumentation and redaction are implemented                                                                      | Create Sentry projects, add both DSNs, trigger test errors in both runtimes, verify redaction, then set the evidence flag          |
| Platform readiness  | Strict scope, approval, callback, webhook, refresh, fresh smoke-test, and kill-switch gates are implemented                             | Create one readiness record per provider only after real acceptance evidence exists                                                |
| Legal/support       | Pages and workflow require owner review                                                                                                 | Finalize the permanent domain, support address, Terms, Privacy, Data Deletion, consent language, and incident contact with counsel |

## Connector truth table

| Connector                                                                               | Source implementation                                                                                                             | External work still required                                                                                                           | Exposure now                          |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Meta Ads + Facebook/Instagram                                                           | OAuth, account/Page/profile discovery, image/carousel publishing, paused paid hierarchy, activation, pause, status, and reporting | Verified Meta business, reviewed app/Login for Business configuration, Advanced Access permissions, production test assets and account | Gated                                 |
| Google Ads                                                                              | OAuth discovery, manager-account support, responsive Search/Display paused creation, activation/pause, GAQL reporting             | Google Cloud OAuth app, manager account, production developer token/access level, billing/conversion test account                      | Gated                                 |
| GA4                                                                                     | OAuth property discovery and read-only reporting                                                                                  | Enabled Data API, reviewed OAuth consent/scopes, selected property test                                                                | Gated                                 |
| SendGrid email                                                                          | Restricted-key onboarding, sender/domain/group validation, signed Event Webhook setup, delivery and suppression handling          | Customer SendGrid account, authenticated domain/DNS, verified From address, unsubscribe group, production webhook test                 | Gated                                 |
| Twilio SMS                                                                              | Restricted-key onboarding, Messaging Service checks, signed STOP/status callbacks, A2P blocking, consent/suppression handling     | Customer Twilio account, sender/number, Trust Hub/business verification, A2P registration where required, funded test recipient        | Gated                                 |
| LinkedIn Pages                                                                          | OAuth organization discovery, text/image, multi-image, PDF publishing, status and organization reporting                          | Community Management API approval, organization-admin test account, current-version smoke test                                         | Early Access                          |
| TikTok organic                                                                          | Login Kit/Content Posting flow, creator options, photo/carousel direct post and status reconciliation                             | TikTok audit; unaudited clients can only post privately; verified media delivery domain and test creator                               | Early Access                          |
| TikTok Ads                                                                              | Authorization/account discovery and partial campaign code                                                                         | Marketing API approval plus full advertiser identity, ad-group, creative, ad, preview, pixel, reporting, and compensation acceptance   | Hidden from connection                |
| Reddit Ads                                                                              | OAuth/account discovery and partial campaign code                                                                                 | Ads API approval plus full campaign/ad-group/post/ad hierarchy, profile/pixel, preview, reporting, and compensation acceptance         | Hidden from connection                |
| ChatGPT Ads                                                                             | Account-scoped key verification, targeting lookup, paused campaign/ad-group/ad creation, state and insights                       | OpenAI Ads API partner access and account-specific advertiser enablement/brand review                                                  | Early Access                          |
| CSV contacts/consent                                                                    | Real import with consent records and workspace isolation                                                                          | First-client consent-file validation                                                                                                   | Available after infrastructure launch |
| Shopify, Klaviyo, Sheets, HubSpot, Snowflake, BigQuery, Segment, Mailchimp, Customer.io | Catalog and product architecture only                                                                                             | Full provider-specific implementation and acceptance; these are not V1 delivery dependencies unless the first client requires one      | Planned                               |

## Owner actions in order

### 1. Lock the production identity

1. Choose the permanent domain and a monitored support email.
2. Publish approved Terms, Privacy, Data Deletion, and Support pages.
3. Decide which legal company owns the provider applications and customer data-processing agreements.
4. Keep the rotated database password in the macOS login Keychain entry `GrowthOS Supabase boqqoxraepwzzmrjvbad`; do not export it to source or chat.

These decisions must happen before provider review because callbacks, privacy URLs, business identity, and deletion instructions are part of the applications.

### 2. Separate environments

1. Keep the current project as development or discard it after credential rotation.
2. Create dedicated staging and production Supabase projects on a paid plan.
3. Use different Auth providers, buckets, encryption keys, worker secrets, provider app credentials, OpenAI projects, and Sentry environments in each.
4. Apply all migrations and verify RLS isolation with two real test users and two workspaces.

### 3. Finish production Supabase

1. Set the exact production Site URL and callback allowlist.
2. Configure custom SMTP and domain authentication.
3. Keep `publish-due`, `send-messages`, `sync-results`, `refresh-tokens`, and `reconcile-organic` deployed from source; the live heartbeat table must remain green.
4. Keep `GROWTHOS_APP_ORIGIN`, `GROWTHOS_WORKER_SECRET`, `GROWTHOS_CRON_SECRET`, and the Sites bypass credential synchronized through the deployment environments.
5. Keep the Vault-backed Cron schedules at publishing every minute, message delivery every minute, token refresh every ten minutes, organic reconciliation every two minutes, and results sync every fifteen minutes.
6. Prove redelivery, dead-letter visibility, token refresh, and idempotency after a forced worker crash.

### 4. Submit provider applications now

Submit Meta, Google, TikTok, Reddit, LinkedIn, and ChatGPT Ads applications in parallel. The GrowthOS operator—not the end customer—must own these applications. Use the permanent domain, callback routes in `PROVIDER_ONBOARDING.md`, legal URLs, a screen recording of the exact connection flow, least-privilege scope explanations, and test credentials permitted by each review process.

Provider approval time is external and cannot be guaranteed. A customer account alone does not grant GrowthOS API access.

### 5. Activate the fastest first-client channels

1. Meta: prove one Facebook Page/Instagram publish and one complete paid hierarchy created paused.
2. Google Ads: prove one Search and one Display hierarchy created paused through the production developer token.
3. SendGrid: prove sender/domain/group verification, signed delivery/open/click/bounce/complaint events, and unsubscribe suppression.
4. Twilio: prove one consented message, delivered callback, STOP callback, invalid-signature rejection, and applicable A2P gating.
5. GA4: prove property selection and read-only reporting.

Record exact scopes, API version, callback/webhook status, refresh health, provider request IDs, and a fresh passing smoke test in **Manage → Provider Readiness**. Disable each kill switch only after its row is complete.

### 6. Configure AI and monitoring

1. Create a production OpenAI project with billing and conservative usage limits.
2. Add `OPENAI_API_KEY`, pin the text/image models, and test invalid schema, moderation rejection, timeout, and rate-limit behavior.
3. Create Sentry browser/server projects and alert routes. Add DSNs without including provider credentials or customer content.
4. Trigger test events from the browser and a server route, confirm redaction, configure alerts, then set `SENTRY_INSTRUMENTATION_VERIFIED=true`.

### 7. Run the final acceptance call

With the first client in a staging or controlled production workspace:

1. Invite the owner and complete Google and email authentication journeys.
2. Create a new empty workspace and finish business onboarding.
3. Add one real product/service, image, legal identity, URL, audience consent record, and sender.
4. Connect every in-scope real account and select exact destinations.
5. Build one template campaign and one AI campaign; inspect every asset and unresolved-field gate.
6. Edit, approve, create paid resources paused, confirm IDs/budgets/accounts, then run an explicitly approved low-budget activation.
7. Schedule organic/email/SMS delivery to controlled test destinations.
8. Confirm provider callbacks, suppression, metrics, retries, reconnect, reviewer approval, and persistence after sign-out.
9. Keep the provider kill switches and a staffed manual-pause procedure available during the first client launch.

## Work that requires the founder or an external provider

GrowthOS engineering cannot independently:

- choose or purchase the permanent domain, change DNS ownership, or approve company legal documents;
- create accounts or accept commercial terms in the founder's/company's identity;
- submit business-verification documents or guarantee Meta, Google, TikTok, Reddit, LinkedIn, Twilio, SendGrid, or OpenAI approval times;
- provide the customer's ad billing, Pages/profiles, conversion tracking, sender reputation, domain authentication, phone numbers, A2P/Trust Hub registrations, or lawful recipient consent;
- generate funded OpenAI, Sentry, SMTP, provider, or production Supabase accounts without the account owner;
- authorize real spend or publish to a customer's live audience without an explicit final approval;
- have counsel determine compliance with CASL, CAN-SPAM, TCPA/FCC, privacy, and local laws.

Engineering can complete the source implementation, migrations, environment wiring after credentials are supplied, provider-review materials, test scripts, smoke tests on authorized accounts, deployment, and remediation of any failed acceptance row.

## No-go rules

- Do not invite the first client while the in-app Launch Readiness summary is not all green.
- Do not turn a roadmap card into a connection button without a complete adapter and real smoke test.
- Do not mark a provider ready from environment variables alone.
- Do not activate paid resources during ordinary automated tests.
- Do not use the current exposed database password or legacy server key for production.
- Do not promise TikTok/Reddit/ChatGPT Ads availability before provider access is actually granted.
