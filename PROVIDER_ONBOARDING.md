# GrowthOS provider onboarding

GrowthOS uses one consistent customer flow for every channel:

1. **Prepare** — explain the account, role, billing, identity, tracking, sender, and compliance prerequisites before the user leaves GrowthOS.
2. **Authorize** — send OAuth customers to the provider's own consent screen, or verify a least-privilege customer-owned credential where the provider does not offer the required customer OAuth flow.
3. **Choose destinations** — discover and present the exact ad accounts, Pages, professional profiles, organizations, analytics properties, Messaging Services, or sender identities. GrowthOS never guesses.
4. **Verify** — perform a fresh provider API check. A connection is not ready merely because a token was issued.

After OAuth, GrowthOS returns directly to the provider setup page and continues with destination selection. Account selections and live health checks are audited. Unavailable providers still show their prerequisites, but cannot start fake authorization.

## Two parties are involved

Every connection depends on both GrowthOS and the customer:

- **GrowthOS owns** the reviewed developer application, client credentials, production callback URLs, required API access, webhook endpoints, encrypted credential storage, refresh/reconciliation workers, smoke-test evidence, and kill switch.
- **The customer owns** their provider account, billing, business assets, Pages/profiles, sender reputation, domains, carrier registrations, lawful consent, and final launch decisions.

The customer never gives GrowthOS a Meta, Google, TikTok, Reddit, or LinkedIn password. Those providers authenticate the customer on their own domain. ChatGPT Ads, SendGrid, and the current design-partner Twilio path use account-scoped or restricted credentials because that is the supported V1 account model; the credentials are verified once, encrypted with AES-256-GCM, and never returned to the browser.

## Customer connection matrix

| Channel | Customer experience in GrowthOS | What marks it ready |
|---|---|---|
| Meta Business | Facebook Login for Business/OAuth, then choose ad accounts, Pages, and linked Instagram professional accounts | Required permissions work, destinations are selected, every selected ad account has an explicit Page identity, and live account state is readable |
| Google Ads | Google OAuth, then choose non-manager client accounts | OAuth and the GrowthOS developer token work together; the client account, billing state, currency, timezone, and capabilities are readable |
| GA4 | Google OAuth, then choose properties | The selected property remains readable through the GA4 APIs |
| TikTok Ads | TikTok for Business authorization, then advertiser selection | Advertiser-specific identity, objective, static-carousel, billing, and reporting capabilities pass production acceptance |
| TikTok Organic | Login Kit/Content Posting authorization, then creator selection | Creator Info works and the current privacy/comment options are available; public posting remains provider-review gated |
| Reddit Ads | Reddit OAuth, then advertiser selection | Account, profile, pixel, billing, preview, destination URL, and paused-resource hierarchy pass production acceptance |
| LinkedIn Pages | LinkedIn OAuth, then organization selection | The user still has an approved organization administrator role and publishing/reporting permissions work on the supported API version |
| ChatGPT Ads | Paste the account-scoped key from Ads Manager | `GET /ad_account` resolves to one active, approved advertiser account and the platform partner gate is open |
| Twilio SendGrid | Enter a restricted API key and exact sender identity | From address is verified, domain is authenticated, unsubscribe group exists, signed Event Webhook is active, and legal sender identity is complete |
| Twilio SMS | Enter the Account SID, restricted API key, callback Auth Token, and Messaging Service SID | Credentials belong to the same active account, the service is active, the signed inbound STOP webhook is configured, legal sender/consent controls exist, and US A2P is verified before US 10DLC delivery |

## First-client runbook

### 1. Finish GrowthOS platform readiness

For each production provider:

1. Create or verify the GrowthOS developer application under the permanent production domain.
   For Meta, create and review a **Facebook Login for Business** configuration and set its configuration ID as `META_LOGIN_CONFIGURATION_ID`; generic Facebook Login is not the production customer-onboarding flow.
2. Configure the exact callback URL:

   ```text
   https://YOUR_DOMAIN/api/v1/oauth/PROVIDER/callback
   ```

3. Add the production client ID/secret or developer token as a server-only environment variable.
4. Complete business verification, provider permission review, webhook verification, and partner/API access.
5. Run the provider acceptance test with an official sandbox/test account where available. For paid channels, create the full hierarchy paused and verify reporting. Do not spend money.
6. In **Manage → Provider Readiness**, record the application ID, required/granted scopes, API version, callback/webhook evidence, token-refresh health, and passing smoke test.
7. Disable the kill switch only after the evidence is current.

The customer connection button remains disabled until this platform gate is open.

### 2. Prepare the customer

Before the call, ask the customer to have:

- the owner/admin login for the provider;
- the exact ad account, Page, profile, analytics property, sender, or Messaging Service they want to use;
- active provider billing for paid services;
- a destination URL and existing conversion/analytics setup where required;
- legal business details and real product/service assets;
- for email/SMS, explicit consent evidence and a physical mailing address;
- for SendGrid, completed DNS/domain authentication, verified From address, and an unsubscribe group;
- for Twilio SMS, an upgraded account, Messaging Service, appropriate sender, and every carrier registration required for the intended recipients.

### 3. Complete the flow with the customer

1. Invite the owner to GrowthOS and have them create the empty workspace.
2. Add the brand, a real product/service, landing page, and real image.
3. Open **Integrations**, choose Data, Advertising, Messaging, or Social, and select one implemented provider.
4. Review **Before you connect** together. Resolve provider-role or billing problems before authorization.
5. Authorize on the provider's domain or submit the explicitly requested restricted credential.
6. Select the exact destination. For Meta paid accounts, select the visible Facebook Page identity.
7. Run **Live verification**. Resolve every blocker; do not treat a warning as success.
8. For email/SMS, complete **Contacts & Consent**, import only consented recipients, and run one internal test-recipient journey.
9. Create one campaign, inspect every creative and delivery field, approve it, create paid resources paused, and verify the provider IDs.
10. Perform the separately approved low-budget/test-destination launch and confirm callbacks, provider state, and metrics before enabling the customer broadly.

## Email and SMS account strategy

The design-partner beta uses customer-owned SendGrid and Twilio accounts. This keeps provider billing and reputation with the customer and avoids pretending GrowthOS has reseller rights it has not obtained.

Twilio offers Connect and embedded compliance products, but those are separate product/account models. A fully GrowthOS-managed SMS signup would require a Twilio ISV architecture, customer/subaccount separation, Trust Hub customer profiles, Brand and Campaign registration, number procurement, billing decisions, and approved embedded onboarding. Do not switch to that model by changing UI copy. Obtain the commercial/platform agreement and implement the full lifecycle first.

For the current customer-owned path, GrowthOS:

- validates that the restricted API key and callback Auth Token belong to the supplied account;
- verifies the Messaging Service and reads US A2P state;
- explicitly configures the signed GrowthOS inbound STOP webhook when the user leaves that option enabled;
- attaches status callbacks to outbound messages;
- blocks US 10DLC delivery until the service reports a verified A2P Campaign;
- stores opt-outs, suppressions, and delivery events durably.

For SendGrid, GrowthOS validates the exact sender and domain, verifies the unsubscribe group, creates or updates the connection-specific Event Webhook, enables signed events, and stores only its public verification key alongside the encrypted credential.

## Failure and recovery behavior

- Denied, expired, replayed, or mismatched OAuth callbacks fail without creating a usable connection.
- Returning from OAuth continues at destination selection instead of dropping the customer back into a catalog.
- Manager-only, inactive, or suspended accounts cannot be selected for delivery.
- A degraded health check remains visible and prevents the setup from showing ready.
- Editing a connected account selection is audited.
- Disconnecting deletes GrowthOS credentials and deselects destinations; it does not delete customer-owned provider resources.
- Paid resources are created paused. Activation requires a separate final confirmation containing exact accounts, dates, currencies, and budgets.

See [PRODUCTION_LAUNCH_CHECKLIST.md](./PRODUCTION_LAUNCH_CHECKLIST.md) for platform accounts and acceptance tests.
