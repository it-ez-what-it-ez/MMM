# GrowthOS

GrowthOS is a private, hosted SaaS prototype for orchestrating marketing work from connected context through activation and learning. The seeded **Northstar Analytics** workspace demonstrates a complete Plan → Create → Approve → Send loop with deterministic providers, durable data, role enforcement, and observable operations.

The application is original product work inspired by the operational clarity of modern composable marketing platforms. It does not reuse third-party copy, branding, illustrations, or proprietary assets.

## What is included

- A focused Today home with one recommended next action, work to continue, approvals, upcoming schedules, and three performance metrics
- A durable Agent workspace that turns one outcome into an evidence-backed audience, campaign, creative, destination, and forecast proposal
- Specialized Lifecycle, Performance, and Cross-channel agent modes with recorded tool steps, reusable context, and explicit human confirmation
- End-to-end agent execution into editable campaign drafts and paused provider ad campaigns; approval, publishing, and spend activation remain separate safeguards
- Channel-first workspaces for Social, Email & Messaging, Paid Ads, and Web & Content; every workspace uses the same Work → Templates → Results structure
- Integration catalog, connection wizard, connection health, capabilities, and detail views
- Brand Kit, voice controls, media and source material management, and protected website import
- Template-first campaign creation in three focused steps, plus a secondary one-objective custom AI flow
- Persistent campaign-template library with Halloween, BFCM, Black Friday, Cyber Monday, holiday, product-launch, webinar, and win-back playbooks
- Visual product campaign template with Instagram posts and carousels, Reels, Facebook posts, TikTok storyboards, full email, SMS, paid-ad, and professional-social mockups
- Pre-selection template inspection, approved product-media selection from Brand & Assets, highlighted placeholders, and a visual confirmation bundle before drafts are created
- Recommended template collections and search, visual channel workspaces, and a weekly cross-channel review plan
- Shared launch-readiness checks across campaign creation, campaign overview, and formal approvals
- Audience composition and overlap previews plus marketer-friendly sync delivery diagnostics
- Editable template variables and complete 7–11 asset bundles scheduled relative to the selected campaign start date
- Approval inbox, comments, bulk decisions, scheduling, and idempotent simulated publishing
- Nested audience rules, consent filtering, customer preview, and destination eligibility
- Four-tab campaign workspaces (Overview, Content, Schedule, Results), list-first approvals, simplified calendar and insights, plus full advanced tools under Manage
- Deterministic AI and integration adapters with stable provider IDs and recoverable failures
- Seeded Owner, Marketer, Reviewer, and Viewer identities for permission testing

## Local development

Prerequisites: Node.js `>=22.13.0` and npm.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The root route redirects to `/app`. Vinext and Miniflare provide local Cloudflare D1 and R2 bindings from `.openai/hosting.json`; no external database or provider credentials are required.

The local database is migrated and seeded automatically on first access. Migrations and seeding are repeatable and use stable seeded identifiers.

## Demo identities

Use the identity switcher in the application header:

| Identity   | Role     | Capabilities                                                       |
| ---------- | -------- | ------------------------------------------------------------------ |
| Maya Chen  | Owner    | Full workspace, connection, activation, and settings control       |
| Priya Shah | Marketer | Campaigns, content, audiences, scheduling, and approved publishing |
| Eli Morgan | Reviewer | Approve, reject, request changes, and comment                      |
| Sofia Kim  | Viewer   | Read-only workspace access                                         |

The selected identity is stored in an HTTP-only demo-session cookie. Every mutation is authorized again on the server and recorded in the audit log.

## Validation

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

Playwright covers Today, the agent outcome-to-draft journey, all four channel workspaces, custom AI creation, visual product-template inspection, the three-step BFCM flow, four-tab campaign routing, Manage access, responsive navigation, integrations, approval, publication idempotency, paused paid-campaign creation, and insights. Unit tests additionally cover agent skill/template routing, confirmation guardrails, channel classification, template filtering, product-format coverage, simplified navigation, legacy aliases, and campaign-tab routing.

The template acceptance journey creates an 11-asset BFCM campaign in three focused steps and verifies that every generated draft has a persisted relative schedule.

## Persistence and providers

- Cloudflare D1 stores workspace, workflow, metrics, operation-ledger, and audit records.
- Cloudflare R2 stores approved image uploads and source assets.
- `AIProvider` and `IntegrationAdapter` are server-only typed contracts in `server/providers.ts`.
- `MarketingAgent` and its typed tools live in `server/marketing-agent.ts`; every run and tool step is persisted in D1 for refresh-safe review and auditability.
- `MockAIProvider` is the default and produces deterministic, Zod-validated output.
- `RemoteAIProvider` activates only when `AI_PROVIDER=remote` and its server-only URL, API key, and model are configured; invalid or unavailable responses recover safely to deterministic generation.
- Mock adapters simulate Meta Ads, Google Ads, Instagram, LinkedIn, Klaviyo, WordPress, Google Analytics, and Slack without collecting credentials.
- Consequential AI actions return confirmation proposals; publish, activation, budget, deletion, and bulk approval always require a user-confirmed server mutation.

The included remote boundary sends `{ model, operation, input }` to a vendor-neutral JSON endpoint and accepts a structured value directly or inside `{ data }` / `{ output }`. To add a specialized provider, implement `AIProvider`, validate its output with the exported schemas, and retain the deterministic fallback. To add an external destination, implement `IntegrationAdapter`, declare capabilities, and route writes through the operation ledger using an idempotency key.

## Environment

Copy `.env.example` to `.env.local` only when extending the server-only provider layer. The shipped product does not require or expose secrets.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for data flow and security decisions and [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for the delivery map.
