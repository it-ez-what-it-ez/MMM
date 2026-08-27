import "server-only";

import {
  createHmac,
  createPublicKey,
  timingSafeEqual,
  verify as verifySignature,
} from "node:crypto";
import type { ChannelKey } from "@/lib/v1/domain";

export type TwilioCredential = {
  accountSid: string;
  apiKeySid: string;
  apiKeySecret: string;
  authToken: string;
  messagingServiceSid: string;
};

export type SendGridCredential = {
  apiKey: string;
  fromName: string;
  fromAddress: string;
  replyToAddress: string | null;
  unsubscribeGroupId: number;
  eventWebhookPublicKey: string;
};

export type MessageSendInput = {
  deliveryId: string;
  channel: Extract<ChannelKey, "email" | "sms">;
  to: string;
  body: string;
  subject?: string | null;
  html?: string | null;
  statusCallbackUrl: string;
  unsubscribeUrl?: string;
  inlineHero?: { contentBase64: string; contentType: string; filename: string };
};

export async function sendTwilioSms(
  credential: TwilioCredential,
  input: MessageSendInput,
) {
  const form = new URLSearchParams({
    To: input.to,
    MessagingServiceSid: credential.messagingServiceSid,
    Body: input.body,
    StatusCallback: input.statusCallbackUrl,
  });
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${credential.accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${credential.apiKeySid}:${credential.apiKeySecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    },
  );
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || typeof payload.sid !== "string")
    throw new Error(
      typeof payload.message === "string"
        ? payload.message
        : `Twilio rejected the message (${response.status}).`,
    );
  return { providerMessageId: payload.sid, status: String(payload.status ?? "queued") };
}

export async function sendSendGridEmail(
  credential: SendGridCredential,
  input: MessageSendInput,
) {
  if (!input.html || !input.subject || !input.unsubscribeUrl)
    throw new Error("Email delivery requires final HTML, a subject, and an unsubscribe URL.");
  const html = input.html.replaceAll("{{unsubscribe_url}}", input.unsubscribeUrl);
  const attachments = input.inlineHero
    ? [{
        content: input.inlineHero.contentBase64,
        type: input.inlineHero.contentType,
        filename: input.inlineHero.filename,
        disposition: "inline",
        content_id: "growthos-hero",
      }]
    : undefined;
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${credential.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{
        to: [{ email: input.to }],
        custom_args: { growthos_delivery_id: input.deliveryId },
      }],
      from: { email: credential.fromAddress, name: credential.fromName },
      reply_to: credential.replyToAddress ? { email: credential.replyToAddress } : undefined,
      subject: input.subject,
      content: [
        { type: "text/plain", value: input.body },
        { type: "text/html", value: html },
      ],
      asm: { group_id: credential.unsubscribeGroupId },
      headers: {
        "List-Unsubscribe": `<${input.unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      attachments,
    }),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    throw new Error(
      Array.isArray(payload.errors)
        ? JSON.stringify(payload.errors)
        : `SendGrid rejected the email (${response.status}).`,
    );
  }
  return {
    providerMessageId: response.headers.get("x-message-id") ?? input.deliveryId,
    status: "accepted",
  };
}

export function validateTwilioSignature(input: {
  authToken: string;
  url: string;
  params: URLSearchParams;
  signature: string;
}) {
  const sorted = [...input.params.entries()].sort(([left], [right]) => left.localeCompare(right));
  const value = sorted.reduce((result, [key, entry]) => `${result}${key}${entry}`, input.url);
  const expected = createHmac("sha1", input.authToken).update(value).digest("base64");
  const actualBytes = Buffer.from(input.signature);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

export function validateSendGridSignature(input: {
  publicKey: string;
  timestamp: string;
  rawBody: string;
  signature: string;
}) {
  try {
    const publicKey = input.publicKey.includes("BEGIN PUBLIC KEY")
      ? createPublicKey(input.publicKey)
      : createPublicKey({ key: Buffer.from(input.publicKey, "base64"), format: "der", type: "spki" });
    return verifySignature(
      "sha256",
      Buffer.from(input.timestamp + input.rawBody),
      publicKey,
      Buffer.from(input.signature, "base64"),
    );
  } catch {
    return false;
  }
}
