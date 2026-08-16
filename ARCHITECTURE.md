# GrowthOS architecture

## Runtime shape

GrowthOS is a Vinext App Router application running React 19 on Cloudflare-compatible infrastructure. It uses one application deployment, a D1 relational database, and an R2 object bucket. Local development uses Miniflare emulators for the same bindings.

```text
Browser UI
  ├─ GET /api/state ───────────────┐
  ├─ POST /api/action ─────────────┼─ Server routes ── Drizzle ── D1
  ├─ POST /api/identity ───────────┤        │
  ├─ POST /api/brand/import ───────┤        ├─ AIProvider
  └─ POST /api/media ──────────────┘        ├─ IntegrationAdapter
                                             └─ R2
```

The browser never receives provider credentials, direct database access, or an authorization decision it can override.

## Data model

`db/schema.ts` defines the relational model for workspaces, members, demo sessions, brand profiles, integrations, connections, campaign templates and template-use history, campaigns, immutable content versions, approvals, comments, audiences, syncs and runs, paid ads, metrics, recommendations, preferences, media, source material, operation ledger entries, jobs, and audit events.

Flexible campaign plans, provider capabilities, voice settings, and nested audience rules are stored as JSON after Zod validation. Ownership, workflow state, idempotency, and relationships remain relational so they can be queried and enforced independently of flexible payloads.

Template definitions are Zod-validated before seeding and again when read from D1. Instantiation merges persisted defaults with user-edited values and the explicit Brand Kit name, renders every asset, calculates each relative schedule in UTC, and records the template-to-campaign relationship. Generated content enters the same draft, versioning, approval, calendar, and publishing workflow as AI-created content.

Template assets are visually rendered according to their channel and format before selection, during customization, in final campaign review, and inside the approval dialog. Product media is selected from approved Brand & Assets records; uploaded image bytes remain in R2 and are returned through a workspace-scoped read route, while the chosen asset ID and name stay in the campaign plan JSON. Missing media intentionally renders as a visible replacement slot rather than pretending the campaign is complete.

`db/runtime.ts` applies numbered SQL migrations and performs idempotent seed insertion. The Northstar Analytics data set is deterministic, so fresh local and hosted environments start in a known acceptance state.

## Request and mutation flow

1. The HTTP-only demo session resolves a seeded identity.
2. The server loads the workspace-scoped record graph.
3. `server/actions.ts` validates the request with a discriminated Zod schema.
4. Permission and workflow gates run on the server.
5. Provider writes receive an operation-specific idempotency key.
6. The operation ledger returns a prior result on retry or records the new stable provider ID.
7. The mutation and its audit event are committed before the typed result is returned.
8. The client refreshes canonical state from `/api/state`.

Mutations return a consistent `ActionResult`: either `{ ok: true, data, auditEventId }` or `{ ok: false, error, fieldErrors, recoverable }`.

## Provider boundaries

`AIProvider` owns brand extraction, campaign planning, content regeneration, and performance summaries. `MockAIProvider` is deterministic and its campaign output is parsed with `campaignPlanSchema` before persistence.

`IntegrationAdapter` exposes connection testing and capability-gated publishing, ad creation, and audience sync operations. Mock adapters add realistic latency, deterministic identifiers, controlled failures, and observable results. Real adapters can replace them without changing UI or workflow code.

AI tools are separated into read tools and proposal tools. Any consequential action—publishing, activation, budget increase, deletion, or bulk approval—must produce a confirmation proposal and then pass through the same authorized mutation path as a manual action.

## Security and governance

- Demo identity is stored in an HTTP-only, `SameSite=Lax` cookie.
- All writes are role checked server-side; Viewer remains read-only.
- Workspace approval mode prevents unapproved publishing regardless of client state.
- Website import accepts only HTTP(S), resolves DNS, blocks private/local addresses, checks every redirect manually, applies timeout and response-size limits, and strips scripts before extraction.
- Uploads are allowlisted by MIME type and written to R2 with workspace-scoped keys.
- Secrets are server-only and none are required by the default product.
- Stable operation keys prevent duplicate external writes across refreshes and retries.
- Audit events capture actor, action, entity, result, and metadata for every meaningful mutation.

## Client structure

`app/components/GrowthOSApp.tsx` contains the shared shell and functional product surfaces. Product naming, navigation, metadata, feature labels, the shared `ChannelKey` classifier, route aliases, and campaign-tab routing are centralized in `lib/product.ts`; colors, spacing, focus, responsive behavior, and light/dark tokens live in `app/globals.css`.

The client derives Social, Email & Messaging, Paid Ads, and Web & Content workspaces from the existing campaign, content, template, paid-ad, schedule, and metric records. This keeps the channel-first presentation free of duplicate data. Primary pages reveal only the next useful layer; Brand & Assets, Audiences, Connections & Syncs, Team, Audit, and Settings stay available under Manage.

The UI is keyboard navigable, uses semantic controls for interactive cards and tabs, labels custom inputs, closes dialogs and drawers with Escape, and replaces the sidebar with a five-destination bottom bar on narrow screens. Charts are descriptive rather than decision-making controls, so the same metrics remain available in text.

## Testing strategy

- Vitest tests pure rules and consequential workflow gates.
- Playwright exercises the persisted cross-page journey against local D1/R2 emulators.
- TypeScript and ESLint protect server/client boundaries and accessibility semantics.
- The production Vinext build validates Cloudflare deployment compatibility.
