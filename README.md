# GrowthOS V1

GrowthOS turns a real product and brand into a complete ecommerce campaign that a marketer can see, edit, approve, and hand off. This is the focused V1 product—not a broad marketing-operations demo.

## V1 workflow

1. Add a product with its image, description, price, and destination URL.
2. Save the brand foundation and voice that every campaign must follow.
3. Pick an occasion or describe the result you want.
4. Review the actual Instagram, Facebook, TikTok, email, SMS, paid-ad, ChatGPT Ads, and Reddit Ads creative.
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

## Real advertising account connections

GrowthOS has production account-onboarding boundaries for Meta Ads, Google Ads, Reddit Ads, and ChatGPT Ads:

- Meta, Google, and Reddit use provider-hosted OAuth. GrowthOS never receives the advertiser's password.
- Access and refresh tokens are AES-GCM encrypted before they are written to D1. Tokens are never returned in `/api/state` or sent to the browser.
- After OAuth, an Owner or Admin chooses the provider ad account. Meta also requires a Page; Reddit requires a profile, funding instrument, and conversion pixel.
- Live connection tests run on the server. Disconnect removes the encrypted credential.
- Meta, Google, Reddit, and ChatGPT provider campaigns are created paused. Activation is a second confirmed server action and updates the real provider before GrowthOS marks the campaign active.

The platform owner must create and approve the OAuth applications first. Copy `.env.example`, add the client credentials and token-encryption key, and register these callback paths for both local and hosted origins:

```text
/api/oauth/google/callback
/api/oauth/meta/callback
/api/oauth/reddit/callback
```

Until those values are present, the product says **Platform setup required**; it does not present seeded or mocked ad accounts as connected.

## ChatGPT Ads

Product campaigns include a real chat-card preview. After the creative is approved, GrowthOS can use OpenAI's Advertiser API to:

- upload the selected product image;
- create the Campaign → Ad Group → Ad hierarchy;
- apply a confirmed lifetime budget;
- create every provider object in `paused` state;
- retain the returned ad ID and review state in the campaign and audit log.

OpenAI's current Ads API uses account-scoped API keys rather than advertiser OAuth. An Owner or Admin pastes a key from [OpenAI Ads Manager](https://ads.openai.com) into the secure connection dialog; GrowthOS verifies it server-side and stores it encrypted. The integration follows the official [API overview](https://developers.openai.com/ads/api-overview), [quickstart](https://developers.openai.com/ads/api-quickstart), and [authentication reference](https://developers.openai.com/ads/api-reference/authentication).

## Reddit Ads

Product campaigns also include a native sponsored-post preview. After approval and explicit budget confirmation, GrowthOS can use Reddit Ads API v3 to create a Traffic campaign, ad group, structured text post, and ad. Every object is created paused, and the returned provider IDs, preview URL, and review state are persisted.

Live account login requires a Reddit developer app configured by the platform owner. The user authorizes `adsread` and `adsedit`, then selects an ad account, profile, funding instrument, and conversion pixel in GrowthOS. See Reddit's [API overview](https://ads-api.reddit.com/docs/v3/), [authentication guide](https://ads-api.reddit.com/docs/v3/authenticate-your-developer-application), and [campaign setup guide](https://ads-api.reddit.com/docs/v3/guides/programs/campaign/campaign-setup).

## Meta and Google Ads

Meta uses Facebook Login and the Marketing API with `ads_management`, `ads_read`, `business_management`, and Page discovery permissions. The platform app needs review/advanced access before advertisers outside the app's test roles can connect. GrowthOS creates a paused campaign, ad set, creative, and ad, and stores the provider campaign ID for activation.

Google uses multi-user OAuth with offline access and the `adwords` scope. The platform also needs a Google Ads developer token. GrowthOS discovers eligible non-manager accounts, then creates a paused Search campaign budget, campaign, ad group, and responsive search ad.

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

Playwright covers product upload persistence, the three-step BFCM journey, visual ChatGPT and Reddit ad review, provider-credential gating, approval enforcement, idempotent publishing, CSV export, responsive navigation, and role restrictions.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for system boundaries and [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for the V1 scope.
