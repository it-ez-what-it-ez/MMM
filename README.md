# GrowthOS V1

GrowthOS turns a real product and brand into a complete ecommerce campaign that a marketer can see, edit, approve, and hand off. This is the focused V1 product—not a broad marketing-operations demo.

## V1 workflow

1. Add a product with its image, description, price, and destination URL.
2. Save the brand foundation and voice that every campaign must follow.
3. Pick an occasion or describe the result you want.
4. Review the actual Instagram, Facebook, TikTok, email, SMS, paid-ad, and ChatGPT Ads creative.
5. Create editable drafts, submit individual assets for approval, and schedule approved work.
6. Export the complete campaign as CSV or use an enabled provider action.

The main product has six workspaces: Home, Campaigns, Products & Brand, Approvals, Calendar, and Results. Older operational routes remain compatible for existing deep links, but they are deliberately absent from the V1 navigation.

## Real product behavior

- Products, brand data, campaigns, content versions, schedules, approvals, results, audit events, and operation IDs persist in Cloudflare D1.
- Product images are validated and stored in Cloudflare R2.
- Every mutation is Zod validated and role checked on the server.
- Drafts do not publish themselves. Approval and consequential provider actions require explicit confirmation.
- Provider writes use an operation ledger so a completed action is not duplicated after refresh or retry.
- The campaign CSV endpoint provides a practical handoff when a channel adapter is not enabled.

## ChatGPT Ads

Product campaigns include a real chat-card preview. After the creative is approved, GrowthOS can use OpenAI's Advertiser API to:

- upload the selected product image;
- create the Campaign → Ad Group → Ad hierarchy;
- apply a confirmed lifetime budget;
- create every provider object in `paused` state;
- retain the returned ad ID and review state in the campaign and audit log.

Live creation is disabled until `OPENAI_ADS_API_KEY` is configured as a server secret. Obtain the account-scoped key in [OpenAI Ads Manager](https://ads.openai.com). The integration follows the official [API overview](https://developers.openai.com/ads/api-overview), [quickstart](https://developers.openai.com/ads/api-quickstart), and [ads reference](https://developers.openai.com/ads/api-reference/ads).

## Local development

Prerequisites: Node.js `>=22.13.0` and npm.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Vinext and Miniflare provide local D1 and R2 bindings from `.openai/hosting.json`.

No credential is needed for the complete product-to-approved-draft workflow. Optional server-only settings are documented in `.env.example`.

## Validation

```bash
npm run db:generate
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

Playwright covers product upload persistence, the three-step BFCM journey, visual ChatGPT ad review, provider-key gating, approval enforcement, idempotent publishing, CSV export, responsive navigation, and role restrictions.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for system boundaries and [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for the V1 scope.
