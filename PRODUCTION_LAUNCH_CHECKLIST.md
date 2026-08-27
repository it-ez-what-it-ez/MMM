# GrowthOS production launch checklist

GrowthOS contains no runtime mock providers. A connection button is exposed only when its environment, provider review, webhook/callback verification, smoke test, and kill switch say it is usable.

Use the customer-facing sequence and operator/customer responsibility split in [PROVIDER_ONBOARDING.md](./PROVIDER_ONBOARDING.md) for every design-partner onboarding call.

## Accounts the GrowthOS operator must create

- Three Supabase projects: development, staging, and production. Apply every migration in `supabase/migrations` and deploy every function in `supabase/functions`.
- An OpenAI API project for campaign planning, copy, image backgrounds, moderation, and webhooks.
- A verified Meta Business, reviewed Meta application, and reviewed Facebook Login for Business configuration.
- A Google Cloud OAuth application, Google Ads manager account, and production Google Ads developer token.
- TikTok for Business and TikTok developer applications with the Marketing and Content Posting products approved.
- A verified Reddit Business administrator account and approved Ads API application.
- A LinkedIn application with Community Management API access.
- ChatGPT Advertiser API partner access. Ordinary OpenAI API access does not replace this.
- Resend or another production SMTP provider for Supabase account creation, magic links, and team invitations.
- Sentry projects and alerts for the app, callbacks, Edge Functions, and queues.

Choose the permanent production domain before provider review. Configure exact production callback and webhook URLs; do not submit a temporary hostname and change it later.

## What each customer creates

For the design-partner beta, each customer owns provider billing, accounts, destinations, registrations, and sender reputation.

### Twilio SMS

1. Create or use a Twilio account and complete business verification.
2. Create a Messaging Service and add an appropriate sender.
3. For application-to-person messages to US recipients over a US 10DLC number, register the business, brand, and campaign for A2P 10DLC. GrowthOS blocks US delivery until the service reports `VERIFIED`.
4. Leave **Configure the signed GrowthOS inbound STOP webhook** enabled during connection. GrowthOS updates the Messaging Service to `https://YOUR_DOMAIN/api/v1/webhooks/twilio/CONNECTION_ID` and verifies it during the live health check. Status callbacks are attached automatically. If the customer declines automatic configuration, they must configure the same URL manually before SMS is marked ready.
5. Create a restricted API key. In GrowthOS enter the Account SID, API Key SID, API Key secret, Auth Token (webhook validation only), and Messaging Service SID.

Canadian businesses can use a Canadian Business Number in supported A2P onboarding. US A2P campaign review is external and can take weeks, so submit it before inviting customers.

### Twilio SendGrid email

1. Create a SendGrid account with API and Event Webhook access.
2. Authenticate the sending domain, complete its DNS records, and verify the exact From address.
3. Create an unsubscribe group for GrowthOS marketing campaigns.
4. Create a restricted API key that can send mail and inspect/manage the sender, suppression, and Event Webhook settings.
5. Enter the key, From name/address, reply-to address, and unsubscribe group ID in GrowthOS. GrowthOS verifies them, configures its connection-specific Event Webhook, enables signed events, and stores the public verification key.

Do not put unrelated businesses behind one ordinary SendGrid account. A GrowthOS-managed reseller/subuser model requires a separate SendGrid partner agreement and is not the V1 design-partner path.

## Customer data and compliance

- Publish Privacy Policy, Terms, Support, and Data Deletion pages before provider review.
- Obtain and record consent before import. Purchased or scraped lists are prohibited.
- Import E.164 phone numbers (`+14165551234`) and ISO timestamps. CSV requires `consent_channels`, `consent_source`, and `consent_timestamp` per row.
- Add the legal business name and physical mailing address. GrowthOS puts an unsubscribe link in every email and STOP instructions in every SMS draft.
- Have counsel approve the customer acquisition and message language under CASL, CAN-SPAM, TCPA/FCC, relevant state/provincial law, and provider policies. Software controls support compliance but do not create consent.

## Environment and deployment

1. Copy `.env.example` into each environment and use distinct secrets and provider applications.
2. Generate a 32-byte `PROVIDER_TOKEN_ENCRYPTION_KEY` and a separate 32+ character `GROWTHOS_WORKER_SECRET` per environment.
3. Set `TWILIO_MESSAGING_ENABLED=true` and `SENDGRID_EMAIL_ENABLED=true` only after the corresponding smoke tests pass.
4. In Provider Readiness, record scopes, API versions, verified callbacks/webhooks, and the latest smoke test. Leave each kill switch enabled until acceptance is complete.
5. Schedule `publish-due`, `send-messages`, `sync-results`, `refresh-tokens`, and `reconcile-organic` through Supabase Cron/Edge Functions.
6. Configure provider webhook secrets and Sentry redaction. Never log access tokens, API keys, Auth Tokens, recipient bodies, email addresses, or phone numbers.

## Required acceptance tests before real users

- RLS isolation between two real test workspaces.
- First-time email signup, returning-user magic links, Google signup/login, team invitations, session refresh, and logout.
- One paused production resource per paid adapter and one test destination per organic adapter.
- Twilio: one opted-in test phone, sent/delivered callback, STOP callback, invalid signature, invalid number, A2P-blocked US recipient, and permission loss.
- SendGrid: domain-authenticated From address, delivered/open/click event, one-click unsubscribe, hard bounce, spam complaint, invalid signature, revoked key, and webhook replay.
- Launch compensation after a paid activation fails part-way.
- Queue crash/reconciliation and an ambiguous provider timeout without duplicate delivery.
- Low-budget real-spend smoke test only after separate written approval.

The application can be deployed privately for these tests. Do not invite customers until every in-scope provider passes its acceptance row.
