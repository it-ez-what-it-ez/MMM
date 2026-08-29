const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const publicKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";

export function getPublicSupabaseConfig() {
  if (!publicUrl || !publicKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  return { url: publicUrl, key: publicKey };
}
export function isSupabaseConfigured(): boolean {
  return Boolean(publicUrl && publicKey);
}

export function resolveAppOrigin(
  values: Record<string, string | undefined>,
): string {
  const configured =
    values.APP_ORIGIN?.trim() ||
    values.NEXT_PUBLIC_APP_ORIGIN?.trim() ||
    values.APP_BASE_URL?.trim() ||
    "http://localhost:3000";
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error(
      "APP_ORIGIN, NEXT_PUBLIC_APP_ORIGIN, or APP_BASE_URL must be a valid absolute URL.",
    );
  }
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("The application origin must use HTTP or HTTPS.");
  if (values.APP_ENV === "production" && url.protocol !== "https:")
    throw new Error("The production application origin must use HTTPS.");
  return url.origin;
}

export function getAppOrigin(): string {
  return resolveAppOrigin(process.env);
}
