# GrowthOS implementation plan

## Product

- Build a hosted, product-only GrowthOS demo for the seeded Northstar Analytics workspace.
- Cover the complete loop from integrations and brand context through campaign creation, approval, simulated publishing, and insights.
- Use a comfortable, channel-first enterprise interface with restrained teal operational accents and progressively disclosed AI and advanced controls.

## Architecture

- Use the Vinext App Router starter with React, strict TypeScript, Tailwind CSS, Zod, Recharts, and Lucide icons.
- Persist structured product state in D1 and media/source files in R2.
- Keep AI and integration providers behind server-only typed adapters; use deterministic mock implementations by default.
- Persist marketing-agent runs and ordered tool traces, then route confirmed proposals through the existing idempotent campaign and provider actions.
- Attribute every mutation to a seeded demo identity and enforce role permissions server-side.

## Delivery

- Seed the Northstar Analytics workspace and all required campaigns, content, approvals, audiences, syncs, ads, metrics, recommendations, and activity.
- Seed and persist seasonal and evergreen campaign templates with editable variables, multi-channel bundles, and template-use history.
- Render platform-specific creative previews before template selection and approval, including product/media placeholders, carousel slides, short-video storyboards, email, and SMS.
- Keep creation template-first in three steps, reduce campaign workspaces to four route-addressable tabs, and derive four channel workspaces without duplicating records.
- Keep Calendar and Approvals separate, move advanced administration under Manage, and use a five-item mobile bottom bar.
- Add a focused Agent workspace with Lifecycle, Performance, and Cross-channel specialties, evidence inspection, real creative previews, connection checks, forecasts, and human-confirmed execution into drafts.
- Add unit and Playwright coverage for the core workflow.
- Complete type, lint, test, build, and private deployment validation.
