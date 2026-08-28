# GrowthOS integrations architecture

## Product model

Integrations are a primary workspace destination at `/app/integrations`. The
catalog is organized by the job a marketer is trying to complete:

1. **Data** — customer, product, CRM, warehouse, commerce, and measurement
   context.
2. **Advertising** — customer-owned paid-media accounts and provider reporting.
3. **Messaging** — email and SMS delivery systems, sender identity, consent,
   suppressions, and callbacks.
4. **Social** — organization Pages and professional profiles used for organic
   publishing.

The fourth category is intentional. Organic publishing is a different
permission, account, approval, and delivery model from paid advertising and
should not be hidden inside an Ads tab.

## Availability rules

The catalog separates three states:

- **Provider integration**: a server adapter and onboarding contract exist.
  The connection button still remains closed until the platform readiness gate
  confirms credentials, provider review, redirects, smoke tests, and the kill
  switch.
- **Native integration**: the capability is implemented inside GrowthOS. CSV
  contact and consent import is the first native data source.
- **Planned**: the integration is useful enough to expose for roadmap planning,
  but there is no connect action and no fake success state.

An authorization token alone never makes an integration ready. Every provider
flow still follows Prepare → Authorize → Choose destinations → Verify.

## Current production connectors

- Data: Google Analytics 4 and native CSV customer/consent import.
- Advertising: Meta Ads, Google Ads, TikTok Ads, Reddit Ads, and ChatGPT Ads
  Early Access.
- Messaging: Twilio SendGrid email and Twilio Messaging SMS.
- Social: Facebook Pages and Instagram professional accounts through Meta
  Business, TikTok photo publishing, and LinkedIn organization Pages.

These connectors retain their existing server permissions, readiness checks,
credential encryption, account selection, health checks, audit events, and
provider-specific publishing boundaries.

## Planned connector order

The roadmap is ordered by value to the first design partners, not by catalog
position:

1. Shopify product, customer, order, and consent import.
2. Klaviyo profiles, lists, consent, email, SMS, and delivery reporting.
3. Google Sheets scheduled customer/product import.
4. HubSpot CRM contacts, lists, and lifecycle stages.
5. Snowflake and BigQuery read-only modeled data sources.
6. Segment traits/events, followed by Mailchimp and Customer.io.
7. LinkedIn Ads and Microsoft Advertising after the current paid-provider
   acceptance suite is complete.

Each new provider requires a real adapter, credentials or OAuth contract,
schema migration where persisted provider keys are involved, RLS review,
health check, platform readiness record, automated tests, and a provider smoke
test. Adding a catalog entry is not considered an implementation.

## Route compatibility

- Primary catalog: `/app/integrations` and category routes such as
  `/app/integrations/data`.
- Provider setup: `/app/integrations/:provider`.
- Existing `/app/manage/connections` links remain supported as compatibility
  aliases, but new OAuth callbacks return to the primary integration route.

