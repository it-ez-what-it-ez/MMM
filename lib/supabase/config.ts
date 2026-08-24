const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";

export function getPublicSupabaseConfig() {
  if (!publicUrl || !publicKey) {
    throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  }
  return { url: publicUrl, key: publicKey };
}
export function isSupabaseConfigured(): boolean {
  return Boolean(publicUrl && publicKey);
}

export function getAppOrigin(): string {
  return (process.env.APP_ORIGIN ?? process.env.NEXT_PUBLIC_APP_ORIGIN ?? "http://localhost:3000").replace(/\/$/, "");
}
