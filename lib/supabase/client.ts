"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getPublicSupabaseConfig } from "./config";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getBrowserSupabase() {
  if (!browserClient) {
    const { url, key } = getPublicSupabaseConfig();
    browserClient = createBrowserClient(url, key);
  }
  return browserClient;
}
