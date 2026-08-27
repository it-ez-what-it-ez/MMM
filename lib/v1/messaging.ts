import type { TacticDesign } from "./domain";

const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENDED = "^{}\\[~]|€";

export function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ]!,
  );
}

export function smsEncoding(value: string): "GSM-7" | "UCS-2" {
  return [...value].every(
    (character) => GSM_BASIC.includes(character) || GSM_EXTENDED.includes(character),
  )
    ? "GSM-7"
    : "UCS-2";
}

export function smsSegmentCount(value: string) {
  const encoding = smsEncoding(value);
  const units =
    encoding === "GSM-7"
      ? [...value].reduce(
          (total, character) => total + (GSM_EXTENDED.includes(character) ? 2 : 1),
          0,
        )
      : [...value].length;
  const single = encoding === "GSM-7" ? 160 : 70;
  const concatenated = encoding === "GSM-7" ? 153 : 67;
  return {
    encoding,
    characters: [...value].length,
    segments: units <= single ? 1 : Math.ceil(units / concatenated),
  };
}

export const SMS_OPT_OUT_KEYWORDS = new Set([
  "stop",
  "quit",
  "end",
  "revoke",
  "opt out",
  "cancel",
  "unsubscribe",
]);

export function isSmsOptOut(value: string) {
  return SMS_OPT_OUT_KEYWORDS.has(value.trim().toLowerCase().replace(/\s+/g, " "));
}

export function buildCampaignEmailHtml(input: {
  businessName: string;
  preheader?: string | null;
  headline: string;
  body: string;
  cta: string;
  destinationUrl: string;
  physicalAddress: string;
  includeHeroImage?: boolean;
  design?: TacticDesign | null;
}) {
  const preheader = input.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(input.preheader)}</div>`
    : "";
  const design = input.design;
  const background = design?.background ?? "#f5f7f6";
  const surface = design?.surface ?? "#ffffff";
  const accent = design?.accent ?? "#087f72";
  const textColor = design?.textColor ?? "#17221f";
  const alignment = design?.alignment ?? "left";
  const fallbackBlocks: TacticDesign["blocks"] = [
    { id: "business", kind: "eyebrow", label: "Sender", text: input.businessName, visible: true },
    { id: "product", kind: "product", label: "Product", text: "", visible: Boolean(input.includeHeroImage) },
    { id: "headline", kind: "headline", label: "Headline", text: input.headline, visible: true },
    { id: "body", kind: "body", label: "Body", text: input.body, visible: true },
    { id: "button", kind: "button", label: "Button", text: input.cta, visible: true },
  ];
  const rows = (design?.blocks ?? fallbackBlocks)
    .filter((block) => block.visible && block.kind !== "footer")
    .map((block) => {
      if (block.kind === "product")
        return input.includeHeroImage
          ? '<tr><td><img src="cid:growthos-hero" alt="" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0" /></td></tr>'
          : "";
      if (block.kind === "eyebrow")
        return `<tr><td style="padding:28px 32px 8px;text-align:${alignment};font-size:13px;line-height:1.4;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${accent}">${escapeHtml(block.text || input.businessName)}</td></tr>`;
      if (block.kind === "headline")
        return `<tr><td style="padding:8px 32px 12px;text-align:${alignment};font-size:32px;line-height:1.18;font-weight:800;color:${textColor}">${escapeHtml(block.text || input.headline)}</td></tr>`;
      if (block.kind === "body")
        return `<tr><td style="padding:8px 32px 20px;text-align:${alignment};font-size:17px;line-height:1.6;color:${textColor}">${escapeHtml(block.text || input.body)}</td></tr>`;
      if (block.kind === "discount")
        return `<tr><td style="padding:8px 32px 20px;text-align:${alignment}"><span style="display:inline-block;padding:10px 14px;border:1px solid ${accent};border-radius:999px;font-size:15px;font-weight:700;color:${accent}">${escapeHtml(block.text)}</span></td></tr>`;
      if (block.kind === "button")
        return `<tr><td style="padding:8px 32px 32px;text-align:${alignment}"><a href="${escapeHtml(input.destinationUrl)}" style="display:inline-block;padding:13px 20px;background:${accent};color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700">${escapeHtml(block.text || input.cta)}</a></td></tr>`;
      return "";
    })
    .join("");
  return `<!doctype html><html><body style="margin:0;background:${background};font-family:Arial,sans-serif;color:${textColor}">${preheader}<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:${surface};border-radius:16px;overflow:hidden">${rows}<tr><td style="padding:24px 32px;border-top:1px solid ${background};font-size:12px;line-height:1.5;color:${textColor};opacity:.7">${escapeHtml(input.physicalAddress)}<br/><a href="{{unsubscribe_url}}" style="color:${textColor}">Unsubscribe</a></td></tr></table></td></tr></table></body></html>`;
}
