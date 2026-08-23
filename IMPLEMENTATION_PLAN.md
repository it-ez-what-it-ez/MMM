# GrowthOS V1 delivery map

## Product promise

An ecommerce marketer can add a product and leave with a complete, visible, approval-ready campaign—without learning a CDP, sync platform, or complex agent workspace.

## Included in V1

- Six-workspace application shell: Home, Campaigns, Products & Brand, Approvals, Calendar, Results
- Persistent product catalog with R2 image upload
- Persistent brand foundation and voice
- Product-first, three-decision campaign creation
- Seasonal and evergreen templates including BFCM, Black Friday, Halloween, holiday, win-back, and product launch
- Platform-shaped previews for Instagram carousel and Reels, Facebook, TikTok, email, SMS, standard paid ads, and ChatGPT chat cards
- Immutable content versions, human approval, scheduling, audit history, and idempotent publishing
- CSV campaign export
- Optional real ChatGPT Ads provider creation, paused and review-aware by default
- Desktop and mobile navigation, keyboard focus, loading, errors, and empty states

## Deliberately deferred

- External authentication, billing, invitations, and multiple workspaces
- Automatic paid-campaign activation or budget increases
- Real Meta, Google, TikTok, social-posting, and email-provider credentials
- General CDP modeling, audience activation, reverse ETL, and sync administration in the primary UI
- Autonomous publishing without a human approval decision

## Acceptance gate

- A product image and metadata persist across refreshes.
- A BFCM campaign is reviewable and created in three focused decisions.
- The user sees the exact channel creative before confirming.
- ChatGPT Ads creation cannot proceed without approval, a real image, explicit budget confirmation, and a server API key.
- Provider objects are created paused and stable IDs are retained.
- Viewer cannot mutate workspace state.
- Typecheck, lint, unit tests, browser tests, migration generation, and production build pass.
- The validated release is deployed privately to the existing GrowthOS site.
