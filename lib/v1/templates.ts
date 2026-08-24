import { type ChannelKey, type TemplateManifest, templateManifestSchema } from "./domain";

type TemplateInput = Omit<TemplateManifest, "version" | "variables" | "assets" | "defaultCadence" | "eligibility"> & {
  offerLabel: string;
  exampleHeadline: string;
  exampleBody: string;
  recommendedChannels: ChannelKey[];
};

const PAID = new Set<ChannelKey>(["meta_ads", "google_search", "google_display", "tiktok_ads", "reddit_ads", "chatgpt_ads"]);
const CAROUSEL = new Set<ChannelKey>([
  "facebook",
  "instagram",
  "tiktok",
  "meta_ads",
  "tiktok_ads",
  "reddit_ads",
]);

function buildTemplate(input: TemplateInput): TemplateManifest {
  const assets = input.recommendedChannels.map((channel, index) => ({
    id: `${input.id}-${channel}`,
    channel,
    format: channel === "google_search" ? "responsive_search" as const : channel === "google_display" ? "responsive_display" as const : channel === "linkedin" ? "static_image" as const : index % 3 === 1 ? "carousel" as const : "static_image" as const,
    aspectRatio: channel === "instagram" || channel === "tiktok" ? "4:5" : channel === "google_display" ? "1.91:1" : "1:1",
    slideCount: index % 3 === 1 && CAROUSEL.has(channel) ? 4 : 1,
    copyIntent: input.outcome,
    exampleHeadline: input.exampleHeadline,
    exampleBody: input.exampleBody,
    cta: input.goals.includes("leads") ? "Book now" : input.goals.includes("sales") ? "Shop now" : "Learn more",
  }));
  const eligibility = [...new Set(input.recommendedChannels.map((channel) => {
    if (["facebook", "instagram", "meta_ads"].includes(channel)) return "meta_business";
    if (["google_search", "google_display"].includes(channel)) return "google_ads";
    if (channel === "tiktok") return "tiktok_organic";
    if (channel === "tiktok_ads") return "tiktok_ads";
    if (channel === "reddit_ads") return "reddit_ads";
    if (channel === "linkedin") return "linkedin_pages";
    return "chatgpt_ads";
  }))].map((provider) => ({ provider: provider as TemplateManifest["eligibility"][number]["provider"], requirement: "A healthy, selected destination account" }));

  return templateManifestSchema.parse({
    id: input.id,
    version: 1,
    name: input.name,
    summary: input.summary,
    outcome: input.outcome,
    businessTypes: input.businessTypes,
    goals: input.goals,
    channels: input.recommendedChannels,
    durationDays: input.durationDays,
    variables: [
      { key: "product_service", label: "Product or service", type: input.businessTypes.length === 1 && input.businessTypes[0] === "service" ? "service" : "product", required: true },
      { key: "offer", label: input.offerLabel, type: "offer", required: true, placeholder: "20% off, free consultation, or your offer" },
      { key: "landing_url", label: "Landing page", type: "url", required: true },
      { key: "start_date", label: "Start date", type: "date", required: true },
      { key: "promo_code", label: "Promo code", type: "promo_code", required: false },
    ],
    assets,
    defaultCadence: assets.map((asset, index) => ({ day: Math.min(index * 2, input.durationDays - 1), assetId: asset.id })),
    eligibility,
  });
}

export const campaignTemplates: TemplateManifest[] = [
  buildTemplate({ id: "bfcm", name: "Black Friday / BFCM", summary: "A focused sale launch, reminder, and last-chance sequence.", outcome: "Convert high-intent holiday shoppers without hiding the offer.", businessTypes: ["ecommerce", "service"], goals: ["sales"], channels: ["instagram"], durationDays: 7, offerLabel: "Black Friday offer", exampleHeadline: "The offer worth waiting for", exampleBody: "Save 25% this weekend. Your favorites, before they are gone.", recommendedChannels: ["instagram", "facebook", "meta_ads", "google_search"] }),
  buildTemplate({ id: "halloween", name: "Halloween promotion", summary: "A playful seasonal countdown with an unmistakable deadline.", outcome: "Turn a timely offer into clicks and purchases.", businessTypes: ["ecommerce", "service"], goals: ["sales", "traffic"], channels: ["instagram"], durationDays: 10, offerLabel: "Halloween offer", exampleHeadline: "A frighteningly good offer", exampleBody: "Your limited Halloween treat is here—only through October 31.", recommendedChannels: ["instagram", "facebook", "tiktok", "meta_ads"] }),
  buildTemplate({ id: "holiday", name: "Holiday / year-end", summary: "Gift-ready creative, urgency, and a clear final order date.", outcome: "Capture holiday demand with a coordinated channel bundle.", businessTypes: ["ecommerce", "service"], goals: ["sales"], channels: ["facebook"], durationDays: 14, offerLabel: "Holiday offer", exampleHeadline: "Make their season", exampleBody: "A thoughtful favorite, ready for everyone on your list.", recommendedChannels: ["instagram", "facebook", "meta_ads", "google_display"] }),
  buildTemplate({ id: "product-launch", name: "Product launch", summary: "Introduce the problem, reveal the product, then prove its value.", outcome: "Build awareness and convert launch interest.", businessTypes: ["ecommerce"], goals: ["awareness", "sales"], channels: ["instagram"], durationDays: 10, offerLabel: "Launch offer", exampleHeadline: "Meet your new everyday essential", exampleBody: "Designed for the way you actually live. Available now.", recommendedChannels: ["instagram", "facebook", "tiktok", "meta_ads", "google_search"] }),
  buildTemplate({ id: "service-launch", name: "Service launch", summary: "Explain the transformation, how it works, and how to start.", outcome: "Generate qualified consultations or bookings.", businessTypes: ["service"], goals: ["leads"], channels: ["linkedin"], durationDays: 14, offerLabel: "Introductory offer", exampleHeadline: "A clearer path to your next result", exampleBody: "A practical service built around your goals, timeline, and team.", recommendedChannels: ["linkedin", "facebook", "meta_ads", "google_search"] }),
  buildTemplate({ id: "limited-offer", name: "Limited-time offer", summary: "A direct offer campaign with deadline-driven follow-through.", outcome: "Convert existing attention during a short promotional window.", businessTypes: ["ecommerce", "service"], goals: ["sales", "leads"], channels: ["facebook"], durationDays: 5, offerLabel: "Limited offer", exampleHeadline: "This week only", exampleBody: "Get the result you want for less—before the offer ends.", recommendedChannels: ["instagram", "facebook", "meta_ads", "reddit_ads"] }),
  buildTemplate({ id: "consultation", name: "Consultation or booking", summary: "Show the outcome, handle hesitation, and invite the next step.", outcome: "Turn qualified interest into booked conversations.", businessTypes: ["service"], goals: ["leads"], channels: ["linkedin"], durationDays: 14, offerLabel: "Booking incentive", exampleHeadline: "Let’s map your next move", exampleBody: "Book a focused consultation and leave with a practical plan.", recommendedChannels: ["linkedin", "facebook", "meta_ads", "google_search"] }),
  buildTemplate({ id: "local-awareness", name: "Local awareness", summary: "Reach nearby customers with local proof and a useful reason to visit.", outcome: "Increase local discovery, visits, and bookings.", businessTypes: ["ecommerce", "service"], goals: ["awareness", "traffic"], channels: ["facebook"], durationDays: 21, offerLabel: "Local offer", exampleHeadline: "Right here in your neighbourhood", exampleBody: "Local service, real people, and a better experience close to home.", recommendedChannels: ["facebook", "instagram", "meta_ads", "google_search"] }),
  buildTemplate({ id: "testimonial", name: "Testimonial / social proof", summary: "Turn one credible customer story into a proof-led campaign.", outcome: "Reduce uncertainty with specific, believable outcomes.", businessTypes: ["ecommerce", "service"], goals: ["trust", "sales"], channels: ["instagram"], durationDays: 10, offerLabel: "Customer outcome", exampleHeadline: "Why customers keep coming back", exampleBody: "The details were thoughtful, the experience was easy, and the result delivered.", recommendedChannels: ["instagram", "facebook", "linkedin", "meta_ads"] }),
  buildTemplate({ id: "event-webinar", name: "Event or webinar", summary: "Announce, build relevance, and drive last-call registrations.", outcome: "Generate registrations and qualified attendance.", businessTypes: ["service", "ecommerce"], goals: ["leads", "awareness"], channels: ["linkedin"], durationDays: 14, offerLabel: "Event promise", exampleHeadline: "A practical session for your next stage", exampleBody: "Join us live for useful answers, real examples, and a clear next step.", recommendedChannels: ["linkedin", "facebook", "instagram", "meta_ads"] }),
  buildTemplate({ id: "educational-carousel", name: "Educational carousel", summary: "Teach one valuable idea across a swipeable visual story.", outcome: "Earn saves, shares, and authority through useful content.", businessTypes: ["service", "ecommerce"], goals: ["engagement", "awareness"], channels: ["instagram"], durationDays: 7, offerLabel: "Core lesson", exampleHeadline: "5 mistakes that quietly cost you growth", exampleBody: "Swipe for the practical fix—and save this for your next planning session.", recommendedChannels: ["instagram", "linkedin", "tiktok", "facebook"] }),
  buildTemplate({ id: "evergreen-traffic", name: "Evergreen website traffic", summary: "A durable value proposition built for ongoing traffic acquisition.", outcome: "Drive consistent qualified visits to a proven landing page.", businessTypes: ["ecommerce", "service"], goals: ["traffic"], channels: ["google_search"], durationDays: 30, offerLabel: "Primary value", exampleHeadline: "A better way to get the result", exampleBody: "Clear value, a credible reason to act, and a direct path to learn more.", recommendedChannels: ["google_search", "google_display", "meta_ads", "reddit_ads", "chatgpt_ads"] }),
];

export function getTemplate(id: string, version = 1): TemplateManifest | null {
  return campaignTemplates.find((template) => template.id === id && template.version === version) ?? null;
}

export function templatesForChannels(channels: ChannelKey[]): TemplateManifest[] {
  if (channels.length === 0) return campaignTemplates;
  return campaignTemplates.filter((template) => channels.some((channel) => template.channels.includes(channel)));
}

export function templateHasPaidDestination(template: TemplateManifest): boolean {
  return template.channels.some((channel) => PAID.has(channel));
}
