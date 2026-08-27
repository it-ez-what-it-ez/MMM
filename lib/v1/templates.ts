import {
  type ChannelKey,
  type TacticDesign,
  type TacticStage,
  type TemplateManifest,
  templateManifestSchema,
} from "./domain";

type TacticCategory = TemplateManifest["category"];
type Layout = TacticDesign["layout"];

type StepInput = {
  id: string;
  label: string;
  stage: TacticStage;
  day: number;
  time?: string;
  channel: ChannelKey;
  headline: string;
  body: string;
  cta?: string;
  layout?: Layout;
  slides?: number;
};

type TacticInput = {
  id: string;
  name: string;
  category: TacticCategory;
  summary: string;
  sequenceSummary: string;
  outcome: string;
  businessTypes: Array<"ecommerce" | "service">;
  goals: string[];
  durationDays: number;
  offerLabel: string;
  colors: [string, string, string, string];
  steps: StepInput[];
};

const PAID = new Set<ChannelKey>([
  "meta_ads",
  "google_search",
  "google_display",
  "tiktok_ads",
  "reddit_ads",
  "chatgpt_ads",
]);

const CAROUSEL = new Set<ChannelKey>([
  "facebook",
  "instagram",
  "tiktok",
  "meta_ads",
  "tiktok_ads",
  "reddit_ads",
]);

const exampleValues = {
  business: "Your business",
  product: "Your product",
  offer: "25% off this weekend",
  description: "Made for everyday use with thoughtful details that matter.",
};

export function resolveTemplateText(
  value: string,
  variables: Partial<typeof exampleValues>,
) {
  const resolved = { ...exampleValues, ...variables };
  return value.replace(
    /\{\{(business|product|offer|description)\}\}/g,
    (_match, key: keyof typeof resolved) => resolved[key] ?? "",
  );
}

function formatFor(channel: ChannelKey, slides: number) {
  if (channel === "google_search") return "responsive_search" as const;
  if (channel === "google_display") return "responsive_display" as const;
  if (channel === "email") return "email_html" as const;
  if (channel === "sms") return "sms_text" as const;
  if (channel === "linkedin") return "static_image" as const;
  if (channel === "tiktok") return slides > 1 ? "photo_carousel" as const : "photo" as const;
  return slides > 1 ? "carousel" as const : "static_image" as const;
}

function aspectRatioFor(channel: ChannelKey) {
  if (channel === "instagram" || channel === "tiktok") return "4:5";
  if (channel === "google_display") return "1.91:1";
  if (channel === "email") return "3:2";
  return "1:1";
}

function designFor(
  step: StepInput,
  colors: TacticInput["colors"],
): TacticDesign {
  const [background, surface, accent, textColor] = colors;
  const offerVisible = ["announce", "remind", "convert"].includes(step.stage);
  return {
    layout: step.layout ?? "product_hero",
    background,
    surface,
    accent,
    textColor,
    alignment: step.layout === "editorial" ? "left" : "center",
    blocks: [
      {
        id: `${step.id}-eyebrow`,
        kind: "eyebrow",
        label: "Intro label",
        text: step.label,
        visible: true,
      },
      {
        id: `${step.id}-headline`,
        kind: "headline",
        label: "Headline",
        text: step.headline,
        visible: true,
      },
      {
        id: `${step.id}-body`,
        kind: "body",
        label: "Body copy",
        text: step.body,
        visible: true,
      },
      {
        id: `${step.id}-product`,
        kind: "product",
        label: "Product or service",
        text: "{{product}}",
        visible: !["sms", "google_search"].includes(step.channel),
      },
      {
        id: `${step.id}-discount`,
        kind: "discount",
        label: "Offer",
        text: "{{offer}}",
        visible: offerVisible,
      },
      {
        id: `${step.id}-button`,
        kind: "button",
        label: "Button",
        text: step.cta ?? "Shop now",
        visible: !["sms", "google_search"].includes(step.channel),
      },
      {
        id: `${step.id}-footer`,
        kind: "footer",
        label: "Legal footer",
        text: "Sender details and unsubscribe preferences",
        visible: step.channel === "email",
      },
    ],
  };
}

function providerFor(channel: ChannelKey): TemplateManifest["eligibility"][number]["provider"] {
  if (channel === "email") return "sendgrid_email";
  if (channel === "sms") return "twilio_messaging";
  if (["facebook", "instagram", "meta_ads"].includes(channel)) return "meta_business";
  if (["google_search", "google_display"].includes(channel)) return "google_ads";
  if (channel === "tiktok") return "tiktok_organic";
  if (channel === "tiktok_ads") return "tiktok_ads";
  if (channel === "reddit_ads") return "reddit_ads";
  if (channel === "linkedin") return "linkedin_pages";
  return "chatgpt_ads";
}

function buildTactic(input: TacticInput): TemplateManifest {
  const channels = [...new Set(input.steps.map((step) => step.channel))];
  const assets = input.steps.map((step) => {
    const slideCount = CAROUSEL.has(step.channel) ? (step.slides ?? 1) : 1;
    return {
      id: `${input.id}-${step.id}`,
      stepLabel: step.label,
      stage: step.stage,
      dayOffset: step.day,
      sendTime: step.time ?? (step.channel === "email" ? "09:30" : "11:00"),
      channel: step.channel,
      format: formatFor(step.channel, slideCount),
      aspectRatio: aspectRatioFor(step.channel),
      slideCount,
      copyIntent: `${step.stage}: ${input.outcome}`,
      exampleHeadline: step.headline,
      exampleBody: step.body,
      cta: step.cta ?? (input.goals.includes("leads") ? "Book now" : "Shop now"),
      design: designFor(step, input.colors),
    };
  });
  const eligibility = [...new Set(channels.map(providerFor))].map((provider) => ({
    provider,
    requirement: "A healthy, selected destination account",
  }));

  return templateManifestSchema.parse({
    id: input.id,
    version: 2,
    name: input.name,
    category: input.category,
    summary: input.summary,
    sequenceSummary: input.sequenceSummary,
    outcome: input.outcome,
    businessTypes: input.businessTypes,
    goals: input.goals,
    channels,
    durationDays: input.durationDays,
    variables: [
      {
        key: "product_service",
        label: "Product or service",
        type:
          input.businessTypes.length === 1 && input.businessTypes[0] === "service"
            ? "service"
            : "product",
        required: true,
      },
      {
        key: "offer",
        label: input.offerLabel,
        type: "offer",
        required: true,
        placeholder: "25% off, a free consultation, or your value proposition",
      },
      { key: "landing_url", label: "Landing page", type: "url", required: true },
      { key: "start_date", label: "Start date", type: "date", required: true },
      { key: "promo_code", label: "Promo code", type: "promo_code", required: false },
    ],
    assets,
    defaultCadence: assets.map((asset) => ({
      day: asset.dayOffset,
      assetId: asset.id,
    })),
    eligibility,
  });
}

const step = (
  id: string,
  label: string,
  stage: TacticStage,
  day: number,
  channel: ChannelKey,
  headline: string,
  body: string,
  options: Partial<Pick<StepInput, "time" | "cta" | "layout" | "slides">> = {},
): StepInput => ({ id, label, stage, day, channel, headline, body, ...options });

export const campaignTemplates: TemplateManifest[] = [
  buildTactic({
    id: "bfcm",
    name: "Black Friday / BFCM",
    category: "seasonal",
    summary: "A complete sale sequence from early access through final call.",
    sequenceSummary: "Launch email + carousel · paid acquisition · reminder · social proof · final-call email and SMS",
    outcome: "Convert high-intent holiday shoppers with a coordinated offer sequence.",
    businessTypes: ["ecommerce", "service"], goals: ["sales"], durationDays: 7,
    offerLabel: "Black Friday offer", colors: ["#121212", "#f3e6bd", "#f5bd43", "#fffaf0"],
    steps: [
      step("early-email", "Early access email", "announce", 0, "email", "Black Friday starts now", "{{product}} is part of our biggest offer of the season. {{offer}}.", { time: "08:30", cta: "Unlock the offer", layout: "offer_card" }),
      step("launch-carousel", "Launch carousel", "announce", 0, "instagram", "The offer worth waiting for", "Meet {{product}}. Swipe for the details, then shop {{offer}} before it is gone.", { time: "10:00", cta: "Shop now", layout: "split", slides: 4 }),
      step("acquisition-ad", "Paid acquisition ad", "convert", 0, "meta_ads", "Black Friday: {{offer}}", "Make {{product}} yours while the offer is live.", { cta: "Shop now", layout: "product_hero", slides: 3 }),
      step("search-intent", "High-intent search", "convert", 0, "google_search", "{{product}} Black Friday", "Shop {{product}} with {{offer}}. Limited availability.", { cta: "Shop the offer" }),
      step("mid-sale-sms", "Mid-sale SMS", "remind", 3, "sms", "Your Black Friday reminder", "{{business}}: {{offer}} on {{product}} is live. Shop before it ends:", { time: "13:00" }),
      step("proof-post", "Customer proof post", "prove", 4, "facebook", "Why customers choose {{product}}", "{{description}} This week, get {{offer}}.", { time: "11:30", cta: "See the offer", layout: "editorial" }),
      step("last-email", "Last-chance email", "convert", 6, "email", "Last call: Black Friday ends tonight", "Your final chance to get {{product}} with {{offer}}.", { time: "09:00", cta: "Shop before it ends", layout: "minimal" }),
      step("last-sms", "Final-hours SMS", "convert", 6, "sms", "Final hours", "{{business}}: Final hours for {{offer}} on {{product}}. Shop now:", { time: "17:00" }),
    ],
  }),
  buildTactic({
    id: "halloween", name: "Halloween promotion", category: "seasonal",
    summary: "A playful countdown that makes the deadline impossible to miss.",
    sequenceSummary: "Teaser · reveal carousel · email · Meta ad · 48-hour reminder · final SMS",
    outcome: "Turn a timely Halloween offer into qualified traffic and purchases.",
    businessTypes: ["ecommerce", "service"], goals: ["sales", "traffic"], durationDays: 10,
    offerLabel: "Halloween offer", colors: ["#201333", "#fff0d8", "#ff7b3d", "#fff8ee"],
    steps: [
      step("teaser", "Campaign teaser", "announce", 0, "instagram", "Something good is lurking", "A limited Halloween surprise for {{product}} is almost here.", { layout: "editorial" }),
      step("reveal", "Offer reveal carousel", "announce", 2, "instagram", "A frighteningly good offer", "Swipe to reveal {{offer}} on {{product}}.", { slides: 4, layout: "offer_card" }),
      step("email", "Offer email", "educate", 2, "email", "Your Halloween treat is here", "No tricks: {{offer}} on {{product}}, available for a limited time.", { cta: "Claim the offer", layout: "product_hero" }),
      step("ad", "Promotion ad", "convert", 2, "meta_ads", "Halloween: {{offer}}", "Discover {{product}} before this offer disappears.", { cta: "Shop now", slides: 3 }),
      step("reminder", "48-hour reminder", "remind", 8, "facebook", "Only 48 hours remain", "{{offer}} on {{product}} ends soon.", { cta: "See the offer", layout: "minimal" }),
      step("final-sms", "Final-day SMS", "convert", 9, "sms", "Ends tonight", "{{business}}: {{offer}} on {{product}} ends tonight. Get it here:", { time: "16:00" }),
    ],
  }),
  buildTactic({
    id: "holiday", name: "Holiday / year-end", category: "seasonal",
    summary: "Gift-ready creative with discovery, proof, and a final order date.",
    sequenceSummary: "Gift guide · email · social carousel · Display ad · shipping reminder · final email",
    outcome: "Capture holiday demand with a coordinated gift-ready campaign.",
    businessTypes: ["ecommerce", "service"], goals: ["sales"], durationDays: 14,
    offerLabel: "Holiday offer", colors: ["#123e35", "#f6ead3", "#bd5a45", "#fffaf1"],
    steps: [
      step("gift-guide", "Gift guide email", "educate", 0, "email", "A thoughtful favorite for everyone", "Give {{product}} this season. {{description}}", { cta: "Explore the gift", layout: "editorial" }),
      step("carousel", "Holiday carousel", "announce", 1, "instagram", "Make their season", "Swipe through the reasons {{product}} belongs on the list.", { slides: 5, layout: "split" }),
      step("facebook", "Gift-ready post", "prove", 4, "facebook", "Ready to give. Easy to love.", "{{product}} brings the thoughtful details that make a gift memorable.", { cta: "Shop gifts" }),
      step("display", "Holiday Display ad", "convert", 1, "google_display", "Give {{product}}", "A gift they will actually use. {{offer}}.", { cta: "Shop now", layout: "product_hero" }),
      step("shipping-sms", "Shipping reminder SMS", "remind", 10, "sms", "Order in time", "{{business}}: Order {{product}} soon for the best chance of holiday delivery. {{offer}}:", { time: "12:00" }),
      step("last-email", "Final order email", "convert", 13, "email", "Last call for holiday orders", "There is still time to give {{product}}. {{offer}}.", { cta: "Order now", layout: "minimal" }),
    ],
  }),
  buildTactic({
    id: "product-launch", name: "Product launch", category: "launch",
    summary: "Build curiosity, reveal the product, prove the value, and convert.",
    sequenceSummary: "Teaser · launch email · reveal carousel · Meta ad · proof post · reminder SMS",
    outcome: "Build awareness and convert interest around a new product.",
    businessTypes: ["ecommerce"], goals: ["awareness", "sales"], durationDays: 10,
    offerLabel: "Launch offer", colors: ["#ebe8df", "#ffffff", "#12695f", "#16312c"],
    steps: [
      step("teaser", "Launch teaser", "announce", 0, "instagram", "A new everyday essential is coming", "Built around the details customers asked for.", { layout: "minimal" }),
      step("reveal-email", "Product reveal email", "announce", 2, "email", "Meet {{product}}", "{{description}} Available now with {{offer}}.", { cta: "Meet the product", layout: "product_hero" }),
      step("reveal-carousel", "Feature carousel", "educate", 2, "instagram", "Meet {{product}}", "Swipe through what it does, why it matters, and how to make it yours.", { slides: 5, layout: "split" }),
      step("launch-ad", "Launch ad", "convert", 2, "meta_ads", "Introducing {{product}}", "Designed for the way you actually live. {{offer}}.", { cta: "Shop now", slides: 3 }),
      step("proof", "Why it works post", "prove", 5, "facebook", "Small details. Better everyday use.", "{{description}}", { cta: "See how it works", layout: "editorial" }),
      step("reminder", "Launch reminder SMS", "remind", 8, "sms", "Now available", "{{business}}: {{product}} is here. {{offer}}. Take a look:", { time: "13:00" }),
    ],
  }),
  buildTactic({
    id: "service-launch", name: "Service launch", category: "launch",
    summary: "Explain the transformation, how the service works, and how to begin.",
    sequenceSummary: "Announcement · educational carousel · email · lead ad · proof post · booking reminder",
    outcome: "Generate qualified consultations or bookings for a new service.",
    businessTypes: ["service"], goals: ["leads"], durationDays: 14,
    offerLabel: "Introductory offer", colors: ["#eaf0f7", "#ffffff", "#315d93", "#1d3654"],
    steps: [
      step("announce", "Service announcement", "announce", 0, "linkedin", "A clearer path to your next result", "Introducing {{product}}: {{description}}", { cta: "Learn more", layout: "editorial" }),
      step("how-it-works", "How-it-works carousel", "educate", 2, "instagram", "How {{product}} works", "A practical process built around your goals, timeline, and team.", { slides: 5, cta: "See the process", layout: "split" }),
      step("email", "Service overview email", "educate", 2, "email", "Is {{product}} right for you?", "See the outcome, process, and next step before you decide. {{offer}}.", { cta: "Explore the service", layout: "editorial" }),
      step("lead-ad", "Consultation ad", "convert", 3, "meta_ads", "Ready for a clearer plan?", "Start with {{product}} and {{offer}}.", { cta: "Book now", layout: "product_hero" }),
      step("proof", "Credibility post", "prove", 7, "linkedin", "What a strong engagement looks like", "Clear expectations, practical work, and a result your team can use.", { cta: "See the approach", layout: "minimal" }),
      step("sms", "Booking reminder", "remind", 12, "sms", "Ready to talk?", "{{business}}: {{offer}} for {{product}} is still available. Book here:", { time: "11:00" }),
    ],
  }),
  buildTactic({
    id: "limited-offer", name: "Limited-time offer", category: "promotion",
    summary: "A focused offer sequence with urgency that stays credible.",
    sequenceSummary: "Launch email · social post · paid ad · midpoint reminder · final-day email and SMS",
    outcome: "Convert existing attention during a short promotional window.",
    businessTypes: ["ecommerce", "service"], goals: ["sales", "leads"], durationDays: 5,
    offerLabel: "Limited offer", colors: ["#f5d7cf", "#fffaf8", "#a44234", "#57251f"],
    steps: [
      step("launch-email", "Offer launch email", "announce", 0, "email", "This week only: {{offer}}", "A direct offer on {{product}}, available for a limited time.", { cta: "Get the offer", layout: "offer_card" }),
      step("launch-post", "Offer post", "announce", 0, "instagram", "This week only", "Get {{offer}} on {{product}} before the window closes.", { cta: "Shop now", layout: "product_hero" }),
      step("paid-ad", "Conversion ad", "convert", 0, "meta_ads", "{{offer}}", "A better time to try {{product}}.", { cta: "Get offer", slides: 3 }),
      step("midpoint", "Midpoint reminder", "remind", 2, "facebook", "Still thinking it over?", "{{offer}} on {{product}} ends soon.", { cta: "See details", layout: "minimal" }),
      step("last-email", "Final-day email", "convert", 4, "email", "Ends today: {{offer}}", "Your last chance to get {{product}} with this offer.", { cta: "Claim it now", layout: "minimal" }),
      step("last-sms", "Final-hours SMS", "convert", 4, "sms", "Final hours", "{{business}}: {{offer}} on {{product}} ends tonight. Get it here:", { time: "16:30" }),
    ],
  }),
  buildTactic({
    id: "consultation", name: "Consultation or booking", category: "growth",
    summary: "Build trust, answer hesitation, and invite a qualified next step.",
    sequenceSummary: "Problem post · value email · proof post · Search ad · booking reminder",
    outcome: "Turn qualified interest into booked conversations.",
    businessTypes: ["service"], goals: ["leads"], durationDays: 14,
    offerLabel: "Booking incentive", colors: ["#e8f1ea", "#ffffff", "#28705a", "#193f34"],
    steps: [
      step("problem", "Problem-awareness post", "educate", 0, "linkedin", "You do not need another vague plan", "{{product}} gives you a focused next step built around your actual situation.", { cta: "See what is included", layout: "editorial" }),
      step("email", "Consultation value email", "educate", 2, "email", "What you will leave with", "A practical conversation, clear priorities, and a next-step plan. {{offer}}.", { cta: "Book a time", layout: "split" }),
      step("proof", "Proof-led post", "prove", 5, "facebook", "Clarity before commitment", "See how {{product}} helps turn uncertainty into an actionable plan.", { cta: "Read more", layout: "minimal" }),
      step("search", "Booking Search ad", "convert", 0, "google_search", "Book {{product}}", "Get a practical plan built around your goals. {{offer}}.", { cta: "Book now" }),
      step("reminder", "Booking reminder SMS", "remind", 10, "sms", "Your next step", "{{business}}: Ready to map your next move? {{offer}} for {{product}}:", { time: "10:30" }),
    ],
  }),
  buildTactic({
    id: "local-awareness", name: "Local awareness", category: "growth",
    summary: "Introduce the business locally, show proof, and drive a visit or booking.",
    sequenceSummary: "Local introduction · neighborhood carousel · Meta ad · proof post · visit reminder",
    outcome: "Increase local discovery, visits, and bookings.",
    businessTypes: ["ecommerce", "service"], goals: ["awareness", "traffic"], durationDays: 21,
    offerLabel: "Local offer", colors: ["#eadfca", "#fffdf8", "#356451", "#203f34"],
    steps: [
      step("intro", "Local introduction", "announce", 0, "facebook", "Right here in your neighborhood", "Meet {{business}} and {{product}}—local service with details that make the experience easy.", { cta: "Get directions", layout: "editorial" }),
      step("carousel", "What to expect carousel", "educate", 3, "instagram", "A better local experience", "Swipe through what makes {{product}} worth the visit.", { slides: 5, cta: "Visit us", layout: "split" }),
      step("ad", "Local awareness ad", "convert", 0, "meta_ads", "Discover {{product}} nearby", "Local, practical, and ready when you are. {{offer}}.", { cta: "Learn more", slides: 3 }),
      step("proof", "Local proof post", "prove", 9, "facebook", "Built for our local community", "The thoughtful service and real people behind {{business}}.", { cta: "Meet us", layout: "minimal" }),
      step("sms", "Visit reminder", "remind", 17, "sms", "Come see us", "{{business}}: {{offer}} for {{product}} is available nearby. Details:", { time: "11:00" }),
    ],
  }),
  buildTactic({
    id: "testimonial", name: "Testimonial / social proof", category: "growth",
    summary: "Turn one credible customer outcome into a proof-led sequence.",
    sequenceSummary: "Quote post · story carousel · proof email · retargeting ad",
    outcome: "Reduce uncertainty with specific, believable customer proof.",
    businessTypes: ["ecommerce", "service"], goals: ["trust", "sales"], durationDays: 10,
    offerLabel: "Customer outcome", colors: ["#f2eee6", "#ffffff", "#8b684a", "#49392d"],
    steps: [
      step("quote", "Customer quote post", "prove", 0, "instagram", "Why customers keep coming back", "“The details were thoughtful, the experience was easy, and the result delivered.”", { cta: "See {{product}}", layout: "editorial" }),
      step("story", "Customer story carousel", "prove", 2, "instagram", "From hesitation to a result", "Swipe through the problem, decision, and outcome behind {{product}}.", { slides: 5, cta: "Read the story", layout: "split" }),
      step("email", "Proof email", "prove", 4, "email", "A customer story worth sharing", "See why customers choose {{product}} and what made the experience work.", { cta: "See their story", layout: "editorial" }),
      step("ad", "Proof retargeting ad", "convert", 4, "meta_ads", "Trusted for the details", "Discover {{product}} with {{offer}}.", { cta: "Learn more", slides: 3, layout: "minimal" }),
    ],
  }),
  buildTactic({
    id: "event-webinar", name: "Event or webinar", category: "growth",
    summary: "Announce the event, establish relevance, and drive last-call registrations.",
    sequenceSummary: "Announcement · agenda carousel · invitation email · registration ad · 24-hour reminder",
    outcome: "Generate registrations and qualified attendance.",
    businessTypes: ["service", "ecommerce"], goals: ["leads", "awareness"], durationDays: 14,
    offerLabel: "Event promise", colors: ["#e2e9f5", "#ffffff", "#365a96", "#24395e"],
    steps: [
      step("announce", "Event announcement", "announce", 0, "linkedin", "A practical session for your next stage", "Join {{business}} for useful answers, real examples, and a clear next step.", { cta: "Register now", layout: "editorial" }),
      step("agenda", "Agenda carousel", "educate", 3, "instagram", "What we will cover", "Swipe through the practical ideas, examples, and takeaways.", { slides: 5, cta: "Save your seat", layout: "split" }),
      step("invite", "Registration email", "convert", 3, "email", "You are invited", "A focused session about {{product}}—and how to use it in the real world.", { cta: "Register free", layout: "product_hero" }),
      step("ad", "Registration ad", "convert", 3, "meta_ads", "Save your seat", "Join {{business}} for a practical session on {{product}}.", { cta: "Register", slides: 3 }),
      step("reminder", "24-hour reminder SMS", "remind", 13, "sms", "Tomorrow", "{{business}}: Your session on {{product}} is tomorrow. Details and registration:", { time: "15:00" }),
    ],
  }),
  buildTactic({
    id: "educational-carousel", name: "Educational carousel", category: "education",
    summary: "Teach one useful idea, expand it by email, and reinforce it socially.",
    sequenceSummary: "Hero carousel · companion email · discussion post · recap",
    outcome: "Earn saves, shares, and authority through genuinely useful content.",
    businessTypes: ["service", "ecommerce"], goals: ["engagement", "awareness"], durationDays: 7,
    offerLabel: "Core lesson", colors: ["#e2ebdf", "#ffffff", "#2e705c", "#193e33"],
    steps: [
      step("carousel", "Educational carousel", "educate", 0, "instagram", "5 mistakes that quietly cost you growth", "Swipe for the practical fix—and save this for your next planning session.", { slides: 6, cta: "Save this post", layout: "split" }),
      step("email", "Companion guide email", "educate", 1, "email", "The complete guide: {{offer}}", "Go deeper on the lesson, with a practical checklist you can use today.", { cta: "Read the guide", layout: "editorial" }),
      step("discussion", "Discussion post", "prove", 3, "linkedin", "Which of these mistakes shows up most often?", "The best answer is usually the one your team can apply consistently.", { cta: "Join the discussion", layout: "minimal" }),
      step("recap", "Weekly recap post", "remind", 6, "facebook", "The lesson in one minute", "A quick recap of {{offer}}—and the first step to apply it.", { cta: "See the guide", layout: "product_hero" }),
    ],
  }),
  buildTactic({
    id: "evergreen-traffic", name: "Evergreen website traffic", category: "growth",
    summary: "A durable search, social, and email system for a proven landing page.",
    sequenceSummary: "Search campaign · Display creative · value carousel · explainer email · proof refresh",
    outcome: "Drive consistent qualified visits to a proven landing page.",
    businessTypes: ["ecommerce", "service"], goals: ["traffic"], durationDays: 30,
    offerLabel: "Primary value", colors: ["#e9e7de", "#ffffff", "#35695c", "#213f37"],
    steps: [
      step("search", "Responsive Search campaign", "convert", 0, "google_search", "A better way to get the result", "Discover {{product}} from {{business}}. {{description}}", { cta: "Learn more" }),
      step("display", "Responsive Display creative", "announce", 0, "google_display", "Meet {{product}}", "Clear value and a direct path to learn more.", { cta: "Visit site", layout: "product_hero" }),
      step("carousel", "Value carousel", "educate", 2, "instagram", "Why {{product}} works", "Swipe through the value, details, and next step.", { slides: 5, cta: "Learn more", layout: "split" }),
      step("email", "Evergreen explainer email", "educate", 5, "email", "A closer look at {{product}}", "{{description}} See what makes it useful and whether it fits your needs.", { cta: "Explore the details", layout: "editorial" }),
      step("proof", "Proof refresh post", "prove", 18, "facebook", "A result that holds up", "Why customers continue to choose {{product}}.", { cta: "See for yourself", layout: "minimal" }),
    ],
  }),
];

export function getTemplate(id: string, version?: number): TemplateManifest | null {
  return (
    campaignTemplates
      .filter(
        (template) =>
          template.id === id &&
          (version === undefined || template.version === version),
      )
      .sort((left, right) => right.version - left.version)[0] ?? null
  );
}

export function templatesForChannels(channels: ChannelKey[]): TemplateManifest[] {
  if (channels.length === 0) return campaignTemplates;
  return campaignTemplates.filter((template) =>
    channels.some((channel) => template.channels.includes(channel)),
  );
}

export function templateHasPaidDestination(template: TemplateManifest): boolean {
  return template.channels.some((channel) => PAID.has(channel));
}
