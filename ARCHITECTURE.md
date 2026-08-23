# GrowthOS V1 architecture

## Product boundary

GrowthOS V1 solves one job: turn a product and brand into campaign creative a marketer can confidently approve. The primary information architecture is intentionally small:

```text
Home
  └─ recommended next action
Products & Brand
  └─ product facts + R2 image + reusable brand rules
Campaigns
  └─ Product → Campaign direction → Actual creative review
Approvals
  └─ human decision per immutable content version
Calendar
  └─ approved schedule
Results
  └─ campaign-level delivery and conversion totals
```

Advanced legacy routes remain readable for deep-link compatibility, but they are not part of the V1 navigation or core journey.

## Runtime and storage

The React 19 App Router application runs through Vinext on Cloudflare-compatible infrastructure.

```text
Browser
  ├─ GET  /api/state
  ├─ POST /api/action
  ├─ POST /api/media ─────────────────────── R2
  └─ GET  /api/campaign-export
                 │
                 ├─ validation + roles + workflow gates
                 ├─ campaign/template rendering
                 ├─ operation ledger + audit events
                 ├─ D1 relational state
                 ├─ optional ChatGPT Ads Advertiser API
                 └─ optional Reddit Ads API v3
```

D1 stores product records, brand rules, templates, campaigns, content and immutable versions, approvals, schedules, metrics, provider IDs, operation keys, and audits. R2 stores validated PNG, JPEG, and WebP product images using workspace-scoped keys. `drizzle/0003_giant_karnak.sql` adds the V1 products table and index.

## Campaign creation

The browser selects a persisted product and campaign template. Template variables are prefilled from product and brand facts. `instantiateCampaignTemplate` renders all channel copy and relative schedules. The user sees the rendered assets before any campaign record exists.

After confirmation, one server action writes the campaign, draft content items, initial immutable versions, relative schedules, and template-use record. Subsequent edits create new versions and return the item to draft. Submission, approval, scheduling, and publication remain separate server-enforced state transitions.

## ChatGPT Ads adapter

`server/chatgpt-ads.ts` is a server-only boundary for `https://api.ads.openai.com/v1`. It never exposes `OPENAI_ADS_API_KEY` to the browser.

The guarded action requires:

1. an approved ChatGPT Ads content item;
2. a persisted product URL and uploaded R2 image;
3. an explicit budget confirmation;
4. an account-scoped Ads API key.

It constrains chat-card titles and body copy to provider limits, uploads the image, and creates a paused campaign, paused ad group, and paused ad. Returned IDs and review status are audited. A completed operation key makes later retries return the existing provider result. No automatic activation or spend action exists in the V1 UI.

## Reddit Ads adapter

`server/reddit-ads.ts` is a server-only OAuth boundary for Reddit Ads API v3. It refreshes a short-lived bearer token with the configured developer application, sends the required application User-Agent, and never exposes the client secret or refresh token to the browser.

The guarded action requires an approved Reddit Ads content item, a valid product destination, explicit lifetime-budget confirmation, and complete account, profile, and funding configuration. It creates a paused Traffic campaign, paused ad group, structured text sponsored post, and paused ad. Each provider ID is checkpointed as it is returned, so a recoverable retry resumes the unfinished step instead of recreating the earlier hierarchy. The final identifiers, preview, and review state are recorded in the operation ledger and audit log. V1 uses structured text posts because private product images are not fetchable by Reddit; media upload support can follow when a public asset-delivery boundary is added.

## Security and correctness

- HTTP-only demo sessions resolve the seeded role; every write is authorized again on the server.
- Viewer is read-only; Reviewer can decide approvals; Marketer and Owner can create products and campaigns.
- All action payloads are parsed by a discriminated Zod schema.
- Uploaded content is allowlisted by MIME type and size.
- Product URLs are validated before persistence.
- Unapproved work cannot be published or sent to ChatGPT Ads or Reddit Ads.
- Secrets are server-only; the default local and hosted application contains none.
- Consequential actions require an explicit `confirmed: true` payload and produce an audit event.

## Validation

Vitest covers domain rules, navigation scope, template rendering, and provider-creative inclusion. Playwright exercises real D1/R2 persistence, credential gates, and cross-role workflows. TypeScript, ESLint, migration generation, and the production Vinext build protect the deployment boundary.
