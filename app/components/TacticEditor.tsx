"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  Check,
  CircleAlert,
  ImagePlus,
  Layers3,
  Mail,
  MessageSquareText,
  Search,
} from "lucide-react";
import {
  approvalBlockers,
  channelLabels,
  type CampaignPlan,
  type TacticDesign,
} from "@/lib/v1/domain";
import { smsSegmentCount } from "@/lib/v1/messaging";

type MediaLike = {
  id: string;
  url?: string;
};

type AccountLike = {
  id: string;
  name: string;
};

const fallbackDesign: TacticDesign = {
  layout: "product_hero",
  background: "#f3f1e8",
  surface: "#ffffff",
  accent: "#087f72",
  textColor: "#102822",
  alignment: "center",
  blocks: [
    { id: "headline", kind: "headline", label: "Headline", text: "", visible: true },
    { id: "body", kind: "body", label: "Body copy", text: "", visible: true },
    { id: "product", kind: "product", label: "Product or service", text: "Product", visible: true },
    { id: "button", kind: "button", label: "Button", text: "Learn more", visible: true },
  ],
};

function toLocalDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function blockText(
  design: TacticDesign,
  kind: TacticDesign["blocks"][number]["kind"],
  fallback: string,
) {
  return design.blocks.find((block) => block.kind === kind && block.visible)?.text ?? fallback;
}

function CreativeCanvas({
  item,
  imageUrl,
  slideIndex,
}: {
  item: CampaignPlan["content"][number];
  imageUrl?: string;
  slideIndex: number;
}) {
  const design = item.design ?? fallbackDesign;
  const slide = item.carouselSlides[slideIndex];
  const headline = slide?.headline ?? blockText(design, "headline", item.headline);
  const body = slide?.body ?? blockText(design, "body", item.body);
  const eyebrow = blockText(design, "eyebrow", item.stepLabel ?? channelLabels[item.channel]);
  const offer = blockText(design, "discount", "");
  const button = blockText(design, "button", item.cta);
  return (
    <div
      className={`tactic-canvas layout-${design.layout} align-${design.alignment}`}
      style={{
        background: design.background,
        color: design.textColor,
        borderColor: design.surface,
      }}
    >
      <div className="tactic-canvas-copy">
        {eyebrow && <span className="tactic-eyebrow" style={{ color: design.accent }}>{eyebrow}</span>}
        <h3>{headline}</h3>
        <p>{body}</p>
        {offer && <strong className="tactic-offer" style={{ color: design.accent }}>{offer}</strong>}
        {button && <span className="tactic-button" style={{ background: design.accent }}>{button}</span>}
      </div>
      <div className="tactic-subject" style={{ background: design.surface }}>
        {imageUrl ? (
          <img src={imageUrl} alt="Selected campaign product or service" />
        ) : (
          <div><ImagePlus size={30} /><span>Upload a real product or service image</span></div>
        )}
      </div>
    </div>
  );
}

function LivePreview({
  item,
  imageUrl,
  slideIndex,
  onSlide,
}: {
  item: CampaignPlan["content"][number];
  imageUrl?: string;
  slideIndex: number;
  onSlide: (index: number) => void;
}) {
  const design = item.design ?? fallbackDesign;
  if (item.channel === "sms") {
    const info = smsSegmentCount(item.body);
    return (
      <div className="tactic-phone">
        <div className="tactic-phone-top">9:41</div>
        <div className="tactic-phone-contact"><MessageSquareText size={18} /><b>Your business</b></div>
        <div className="tactic-message-bubble">{item.body}</div>
        <small>{info.characters} characters · {info.segments} SMS segment{info.segments === 1 ? "" : "s"}</small>
      </div>
    );
  }
  if (item.channel === "email") {
    return (
      <div className="tactic-email-client">
        <div className="tactic-email-toolbar"><Mail size={16} /> Inbox preview</div>
        <dl>
          <div><dt>From</dt><dd>{item.messaging?.fromName ?? "Verified sender required"}</dd></div>
          <div><dt>Subject</dt><dd>{item.messaging?.subject ?? item.headline}</dd></div>
          <div><dt>Preview</dt><dd>{item.messaging?.preheader ?? item.body.slice(0, 120)}</dd></div>
        </dl>
        <div className="tactic-email-body" style={{ background: design.background, color: design.textColor }}>
          {imageUrl ? <img src={imageUrl} alt="Selected campaign product or service" /> : <div className="tactic-email-placeholder"><ImagePlus size={28} /> Real image required</div>}
          <span style={{ color: design.accent }}>{blockText(design, "eyebrow", item.stepLabel ?? "")}</span>
          <h3>{blockText(design, "headline", item.headline)}</h3>
          <p>{blockText(design, "body", item.body)}</p>
          {blockText(design, "discount", "") && <strong style={{ color: design.accent }}>{blockText(design, "discount", "")}</strong>}
          <span className="tactic-email-button" style={{ background: design.accent }}>{blockText(design, "button", item.cta)}</span>
          <small>{item.messaging?.physicalAddress ?? "Physical mailing address required"}<br />Unsubscribe</small>
        </div>
      </div>
    );
  }
  if (item.channel === "google_search") {
    return (
      <div className="tactic-search-preview">
        <small>Sponsored · {new URL(item.destinationUrl).hostname}</small>
        <h3>{(item.searchHeadlines ?? [item.headline]).join(" | ")}</h3>
        {(item.searchDescriptions ?? [item.body]).map((description, index) => <p key={`${description}-${index}`}>{description}</p>)}
        <div>{(item.searchKeywords ?? []).map((keyword) => <span key={keyword}>{keyword}</span>)}</div>
      </div>
    );
  }
  return (
    <div className="tactic-social-preview">
      <div className="tactic-social-header"><span /> <b>Your business</b><small>Sponsored / scheduled preview</small></div>
      <CreativeCanvas item={item} imageUrl={imageUrl} slideIndex={slideIndex} />
      <div className="tactic-social-caption"><b>{item.headline}</b><p>{item.body}</p><span>{item.cta}</span></div>
      {item.carouselSlides.length > 1 && (
        <div className="tactic-slide-strip" aria-label="Carousel slides">
          {item.carouselSlides.map((slide, index) => (
            <button key={`${item.id}-slide-${index}`} className={index === slideIndex ? "active" : ""} onClick={() => onSlide(index)}>
              <b>{index + 1}</b><span>{slide.headline}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TacticEditor({
  plan,
  media,
  accounts,
  onChange,
}: {
  plan: CampaignPlan;
  media: MediaLike[];
  accounts: AccountLike[];
  onChange: (plan: CampaignPlan) => void;
}) {
  const [selectedId, setSelectedId] = useState(plan.content[0]?.id ?? "");
  const [slideIndex, setSlideIndex] = useState(0);
  const blockers = approvalBlockers(plan);
  const sorted = useMemo(
    () => [...plan.content].sort((a, b) => (a.scheduledFor ?? plan.startsAt).localeCompare(b.scheduledFor ?? plan.startsAt)),
    [plan],
  );
  const item = plan.content.find((entry) => entry.id === selectedId) ?? sorted[0];

  useEffect(() => {
    setSlideIndex(0);
  }, [selectedId]);

  if (!item) return null;
  const design = item.design ?? {
    ...fallbackDesign,
    blocks: fallbackDesign.blocks.map((block) => ({
      ...block,
      text: block.kind === "headline" ? item.headline : block.kind === "body" ? item.body : block.kind === "button" ? item.cta : block.text,
    })),
  };
  const asset = media.find((entry) => item.mediaIds.includes(entry.id));
  const account = accounts.find((entry) => entry.id === item.accountId);

  function patchItem(patch: Partial<CampaignPlan["content"][number]>) {
    onChange({
      ...plan,
      content: plan.content.map((entry) => entry.id === item.id ? { ...entry, ...patch } : entry),
    });
  }

  function patchDesign(patch: Partial<TacticDesign>) {
    patchItem({ design: { ...design, ...patch } });
  }

  function patchBlock(blockId: string, patch: Partial<TacticDesign["blocks"][number]>) {
    const blocks = design.blocks.map((block) => block.id === blockId ? { ...block, ...patch } : block);
    const changed = blocks.find((block) => block.id === blockId)!;
    const contentPatch: Partial<CampaignPlan["content"][number]> = { design: { ...design, blocks } };
    if (typeof patch.text === "string") {
      if (changed.kind === "headline") contentPatch.headline = patch.text;
      if (changed.kind === "body") contentPatch.body = patch.text;
      if (changed.kind === "button") contentPatch.cta = patch.text;
    }
    patchItem(contentPatch);
  }

  function patchCopy(kind: "headline" | "body" | "button", text: string) {
    const contentPatch: Partial<CampaignPlan["content"][number]> =
      kind === "headline"
        ? { headline: text }
        : kind === "body"
          ? { body: text }
          : { cta: text };
    if (item.channel === "google_search" && kind === "headline") {
      contentPatch.searchHeadlines = (item.searchHeadlines ?? []).map(
        (value, index) => (index === 0 ? text.slice(0, 30) : value),
      );
    }
    if (item.channel === "google_search" && kind === "body") {
      contentPatch.searchDescriptions = (item.searchDescriptions ?? []).map(
        (value, index) => (index === 0 ? text.slice(0, 90) : value),
      );
    }
    if (item.messaging && kind !== "button") {
      contentPatch.messaging = {
        ...item.messaging,
        ...(kind === "headline" ? { subject: text } : {}),
        ...(kind === "body" ? { preheader: text.slice(0, 150) } : {}),
      };
    }
    const matchingBlock = design.blocks.find((block) => block.kind === kind);
    if (matchingBlock) {
      contentPatch.design = {
        ...design,
        blocks: design.blocks.map((block) =>
          block.id === matchingBlock.id ? { ...block, text } : block,
        ),
      };
    }
    patchItem(contentPatch);
  }

  function patchSlide(index: number, patch: Partial<CampaignPlan["content"][number]["carouselSlides"][number]>) {
    const slides = item.carouselSlides.map((slide, position) => position === index ? { ...slide, ...patch } : slide);
    patchItem({
      carouselSlides: slides,
      ...(index === 0 && typeof patch.headline === "string" ? { headline: patch.headline } : {}),
      ...(index === 0 && typeof patch.body === "string" ? { body: patch.body } : {}),
    });
  }

  function patchSearchHeadline(index: number, text: string) {
    patchItem({
      searchHeadlines: item.searchHeadlines?.map((value, position) =>
        position === index ? text : value,
      ),
      ...(index === 0 ? { headline: text } : {}),
    });
  }

  function patchSearchDescription(index: number, text: string) {
    patchItem({
      searchDescriptions: item.searchDescriptions?.map((value, position) =>
        position === index ? text : value,
      ),
      ...(index === 0 ? { body: text } : {}),
    });
  }

  return (
    <section className="tactic-editor-shell">
      <header className="tactic-editor-header">
        <div>
          <p className="kicker">Tactic editor</p>
          <h2>{plan.name}</h2>
          <p>Edit every message and see the real channel preview before creating the draft.</p>
        </div>
        <div className={blockers.length ? "tactic-readiness has-blockers" : "tactic-readiness ready"}>
          {blockers.length ? <CircleAlert size={18} /> : <Check size={18} />}
          <span><b>{blockers.length ? `${blockers.length} item${blockers.length === 1 ? "" : "s"} need attention` : "Ready to save"}</b><small>{plan.content.length} timed steps · {plan.channels.length} channels</small></span>
        </div>
      </header>
      <div className="tactic-workbench">
        <nav className="tactic-step-rail" aria-label="Campaign tactic steps">
          <div className="tactic-step-rail-title"><Layers3 size={17} /><b>Sequence</b></div>
          {sorted.map((entry, index) => (
            <button key={entry.id} className={entry.id === item.id ? "active" : ""} onClick={() => setSelectedId(entry.id)}>
              <span className="tactic-step-number">{index + 1}</span>
              <span><b>{entry.stepLabel ?? channelLabels[entry.channel]}</b><small>{channelLabels[entry.channel]} · {new Date(entry.scheduledFor ?? plan.startsAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</small></span>
              {entry.unresolvedFields.length > 0 && <CircleAlert size={15} />}
            </button>
          ))}
        </nav>

        <main className="tactic-preview-stage">
          <div className="tactic-preview-heading">
            <div><span className="channel-mark">{channelLabels[item.channel].slice(0, 2).toUpperCase()}</span><span><b>{item.stepLabel ?? channelLabels[item.channel]}</b><small>{channelLabels[item.channel]} · {item.format.replaceAll("_", " ")}</small></span></div>
            <span>{item.tacticStage ?? "campaign"}</span>
          </div>
          <LivePreview item={item} imageUrl={asset?.url} slideIndex={slideIndex} onSlide={setSlideIndex} />
          <dl className="tactic-delivery-summary">
            <div><dt>Account</dt><dd>{account?.name ?? "Not connected"}</dd></div>
            <div><dt>Destination</dt><dd>{new URL(item.destinationUrl).hostname}</dd></div>
            <div><dt>Schedule</dt><dd>{new Date(item.scheduledFor ?? plan.startsAt).toLocaleString()}</dd></div>
          </dl>
          {item.unresolvedFields.length > 0 && <div className="tactic-item-blockers"><CircleAlert size={16} /><span>{item.unresolvedFields.join(" · ")}</span></div>}
        </main>

        <aside className="tactic-inspector">
          <div className="tactic-inspector-title"><b>Edit this step</b><span>Changes update the preview immediately.</span></div>
          <label>Send or start time<input type="datetime-local" value={toLocalDateTime(item.scheduledFor ?? plan.startsAt)} onChange={(event) => patchItem({ scheduledFor: event.target.value ? new Date(event.target.value).toISOString() : null })} /></label>
          {item.carouselSlides.length > 1 ? (
            <div className="tactic-slide-fields">
              <p><b>Carousel slide {slideIndex + 1}</b> of {item.carouselSlides.length}</p>
              <label>Slide headline<input value={item.carouselSlides[slideIndex]?.headline ?? ""} onChange={(event) => patchSlide(slideIndex, { headline: event.target.value })} /></label>
              <label>Slide copy<textarea rows={4} value={item.carouselSlides[slideIndex]?.body ?? ""} onChange={(event) => patchSlide(slideIndex, { body: event.target.value })} /></label>
            </div>
          ) : item.channel !== "google_search" ? (
            <>
              <label>Headline<input value={item.headline} onChange={(event) => patchCopy("headline", event.target.value)} /></label>
              <label>Body copy<textarea rows={5} value={item.body} onChange={(event) => patchCopy("body", event.target.value)} /></label>
            </>
          ) : null}
          {!["sms", "google_search"].includes(item.channel) && <label>Button text<input value={item.cta} onChange={(event) => patchCopy("button", event.target.value)} /></label>}
          {item.design && !["sms", "google_search"].includes(item.channel) && (
            <details className="tactic-design-settings" open>
              <summary>Design and blocks</summary>
              <label>Layout<select value={design.layout} onChange={(event) => patchDesign({ layout: event.target.value as TacticDesign["layout"] })}><option value="product_hero">Product hero</option><option value="split">Split</option><option value="editorial">Editorial</option><option value="offer_card">Offer card</option><option value="minimal">Minimal</option></select></label>
              <div className="tactic-color-row">
                <label>Background<input type="color" value={design.background} onChange={(event) => patchDesign({ background: event.target.value })} /></label>
                <label>Accent<input type="color" value={design.accent} onChange={(event) => patchDesign({ accent: event.target.value })} /></label>
                <label>Text<input type="color" value={design.textColor} onChange={(event) => patchDesign({ textColor: event.target.value })} /></label>
              </div>
              <div className="tactic-block-list">
                {design.blocks.map((block) => (
                  <div key={block.id} className="tactic-block-row">
                    <label className="tactic-block-toggle"><input type="checkbox" checked={block.visible} onChange={(event) => patchBlock(block.id, { visible: event.target.checked })} /><span>{block.label}</span></label>
                    {block.visible && block.kind !== "product" && block.kind !== "footer" && <input value={block.text} onChange={(event) => patchBlock(block.id, { text: event.target.value })} />}
                  </div>
                ))}
              </div>
            </details>
          )}
          {item.channel === "google_search" && (
            <div className="tactic-search-fields">
              <p><Search size={15} /><b>Responsive Search assets</b></p>
              {(item.searchHeadlines ?? []).map((headline, index) => <label key={`headline-${index}`}>Headline {index + 1}<input maxLength={30} value={headline} onChange={(event) => patchSearchHeadline(index, event.target.value)} /><small>{headline.length}/30</small></label>)}
              {(item.searchDescriptions ?? []).map((description, index) => <label key={`description-${index}`}>Description {index + 1}<textarea maxLength={90} rows={2} value={description} onChange={(event) => patchSearchDescription(index, event.target.value)} /><small>{description.length}/90</small></label>)}
            </div>
          )}
        </aside>
      </div>
      <footer className="tactic-editor-footer"><CalendarClock size={16} /><span>Nothing publishes from this editor. Saving creates an editable draft; approval and launch remain separate.</span></footer>
    </section>
  );
}
