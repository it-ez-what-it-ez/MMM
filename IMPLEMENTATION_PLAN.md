# GrowthOS implementation plan

## Product

- Build a hosted, product-only GrowthOS demo for the seeded Northstar Analytics workspace.
- Cover the complete loop from integrations and brand context through campaign creation, approval, simulated publishing, and insights.
- Use a dense, original enterprise interface with teal operational accents and violet AI accents.

## Architecture

- Use the Vinext App Router starter with React, strict TypeScript, Tailwind CSS, Zod, Recharts, and Lucide icons.
- Persist structured product state in D1 and media/source files in R2.
- Keep AI and integration providers behind server-only typed adapters; use deterministic mock implementations by default.
- Attribute every mutation to a seeded demo identity and enforce role permissions server-side.

## Delivery

- Seed the Northstar Analytics workspace and all required campaigns, content, approvals, audiences, syncs, ads, metrics, recommendations, and activity.
- Add unit and Playwright coverage for the core workflow.
- Complete type, lint, test, build, and private deployment validation.
