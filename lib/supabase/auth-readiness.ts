import { getPublicSupabaseConfig } from "./config";

export type SupabaseAuthReadiness = {
  emailEnabled: boolean;
  googleEnabled: boolean;
  checked: boolean;
};

export function parseSupabaseAuthSettings(
  input: unknown,
): SupabaseAuthReadiness {
  if (!input || typeof input !== "object") {
    return { emailEnabled: false, googleEnabled: false, checked: false };
  }
  const external = (input as { external?: unknown }).external;
  if (!external || typeof external !== "object") {
    return { emailEnabled: false, googleEnabled: false, checked: false };
  }
  const providers = external as Record<string, unknown>;
  return {
    emailEnabled: providers.email === true,
    googleEnabled: providers.google === true,
    checked: true,
  };
}

export async function getSupabaseAuthReadiness(): Promise<SupabaseAuthReadiness> {
  const { url, key } = getPublicSupabaseConfig();
  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      cache: "no-store",
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!response.ok) {
      return { emailEnabled: false, googleEnabled: false, checked: false };
    }
    return parseSupabaseAuthSettings(await response.json());
  } catch {
    return { emailEnabled: false, googleEnabled: false, checked: false };
  }
}
