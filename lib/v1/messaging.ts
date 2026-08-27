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
}) {
  const preheader = input.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(input.preheader)}</div>`
    : "";
  const hero = input.includeHeroImage
    ? '<img src="cid:growthos-hero" alt="" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0" />'
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f5f7f6;font-family:Arial,sans-serif;color:#17221f">${preheader}<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden"><tr><td>${hero}</td></tr><tr><td style="padding:32px"><p style="margin:0 0 12px;font-size:13px;color:#66736f">${escapeHtml(input.businessName)}</p><h1 style="margin:0 0 16px;font-size:30px;line-height:1.2">${escapeHtml(input.headline)}</h1><p style="margin:0 0 24px;font-size:17px;line-height:1.6">${escapeHtml(input.body)}</p><a href="${escapeHtml(input.destinationUrl)}" style="display:inline-block;padding:13px 20px;background:#087f72;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700">${escapeHtml(input.cta)}</a></td></tr><tr><td style="padding:24px 32px;border-top:1px solid #e8ecea;font-size:12px;line-height:1.5;color:#68746f">${escapeHtml(input.physicalAddress)}<br/><a href="{{unsubscribe_url}}" style="color:#50645e">Unsubscribe</a></td></tr></table></td></tr></table></body></html>`;
}
