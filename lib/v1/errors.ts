const sensitivePatterns: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\b(?:access|refresh|auth|api)[_-]?token\b\s*[:=]\s*[^\s,;]+/gi,
  /\b(?:api[_-]?key|client[_-]?secret|password)\b\s*[:=]\s*[^\s,;]+/gi,
  /\bpostgres(?:ql)?:\/\/[^\s]+/gi,
  /\bSG\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  /\bsk-[A-Za-z0-9_-]{12,}/g,
  /([?&](?:access_token|refresh_token|key|secret|password)=)[^&\s]+/gi,
];

export function safeOperationalErrorMessage(error: unknown) {
  const original =
    error instanceof Error ? error.message : "Unexpected server error.";
  let message = original.replace(/[\r\n\t]+/g, " ").trim();
  for (const pattern of sensitivePatterns)
    message = message.replace(pattern, (_match, prefix?: unknown) =>
      typeof prefix === "string" ? `${prefix}[redacted]` : "[redacted]",
    );
  return (message || "Unexpected server error.").slice(0, 600);
}
