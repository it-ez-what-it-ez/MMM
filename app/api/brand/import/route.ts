import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({ url: z.string().url() });

function blocked(hostname: string) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(host)) return true;
  const parts = host.split(".").map(Number);
  if (parts.length === 4 && parts.every(Number.isFinite) && parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  return host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:");
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Enter a valid public website URL." }, { status: 400 });
  let current = new URL(parsed.data.url);
  if (!["http:", "https:"].includes(current.protocol) || blocked(current.hostname)) return NextResponse.json({ ok: false, error: "Private or local network addresses cannot be imported." }, { status: 400 });
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 6000);
  try {
    let response: Response | undefined;
    for (let redirect = 0; redirect < 3; redirect++) {
      response = await fetch(current, { signal: controller.signal, redirect: "manual", headers: { "User-Agent": "GrowthOS-Brand-Importer/1.0" } });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location"); if (!location) break;
      current = new URL(location, current);
      if (blocked(current.hostname)) throw new Error("Redirected to a private address.");
    }
    if (!response?.ok) throw new Error("The website did not return a usable response.");
    const length = Number(response.headers.get("content-length") || 0);
    if (length > 1_000_000) throw new Error("The page is too large to import safely.");
    const html = (await response.text()).slice(0, 1_000_000);
    const cleaned = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 4000);
    return NextResponse.json({ ok: true, draft: { website: current.origin, description: cleaned.slice(0, 420), valueProposition: cleaned.slice(0, 180) } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Website import failed." }, { status: 400 });
  } finally { clearTimeout(timer); }
}
