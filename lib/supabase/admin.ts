import { createClient } from "@supabase/supabase-js";
import { getPublicSupabaseConfig } from "./config";

export function getSupabaseAdmin() {
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!secret) throw new Error("SUPABASE_SECRET_KEY is required for this server-only operation.");
  const { url } = getPublicSupabaseConfig();
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
