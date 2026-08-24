import "server-only";

type Suggestions = {
  summary: string;
  colors: string[];
  logos: string[];
  products: Array<{
    name: string;
    description: string;
    landingUrl: string;
    kind: "ecommerce" | "service";
  }>;
  pages: Array<{ url: string; title: string; description: string }>;
};

function privateIpv4(ip: string) {
  const values = ip.split(".").map(Number);
  return (
    values.length === 4 &&
    (values[0] === 10 ||
      values[0] === 127 ||
      values[0] === 0 ||
      (values[0] === 169 && values[1] === 254) ||
      (values[0] === 172 && values[1] >= 16 && values[1] <= 31) ||
      (values[0] === 192 && values[1] === 168) ||
      (values[0] === 100 && values[1] >= 64 && values[1] <= 127) ||
      values[0] >= 224)
  );
}
function privateIpv6(ip: string) {
  const value = ip.toLowerCase();
  return (
    value === "::1" ||
    value === "::" ||
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    value.startsWith("fe8") ||
    value.startsWith("fe9") ||
    value.startsWith("fea") ||
    value.startsWith("feb") ||
    value.startsWith("::ffff:127.") ||
    value.startsWith("::ffff:10.") ||
    value.startsWith("::ffff:192.168.")
  );
}

async function assertPublicHost(url: URL) {
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("Only public HTTP or HTTPS websites can be imported.");
  if (url.username || url.password)
    throw new Error("Website URLs cannot include credentials.");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    privateIpv4(host) ||
    (host.includes(":") && privateIpv6(host))
  )
    throw new Error("Private or local addresses are blocked.");
  for (const type of ["A", "AAAA"]) {
    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`,
      {
        headers: { Accept: "application/dns-json" },
        signal: AbortSignal.timeout(4000),
      },
    );
    if (!response.ok)
      throw new Error("The website host could not be verified safely.");
    const payload = (await response.json()) as {
      Answer?: Array<{ data: string }>;
    };
    for (const answer of payload.Answer ?? [])
      if (privateIpv4(answer.data) || privateIpv6(answer.data))
        throw new Error("The website resolves to a private or local address.");
  }
}

async function boundedFetch(start: URL, originalHost: string) {
  let current = start;
  for (let redirects = 0; redirects <= 3; redirects++) {
    await assertPublicHost(current);
    if (current.hostname !== originalHost)
      throw new Error("Website import redirects must stay on the same site.");
    const response = await fetch(current, {
      redirect: "manual",
      headers: {
        "User-Agent": "GrowthOSWebsiteImporter/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(8000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Website returned an invalid redirect.");
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) throw new Error(`Website returned ${response.status}.`);
    const type = response.headers.get("content-type")?.split(";")[0].trim();
    if (type !== "text/html" && type !== "application/xhtml+xml")
      throw new Error("Website import only accepts HTML pages.");
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > 2_000_000)
      throw new Error("Website page exceeds the 2 MB import limit.");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Website returned no content.");
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 2_000_000) {
        await reader.cancel();
        throw new Error("Website page exceeds the 2 MB import limit.");
      }
      chunks.push(value);
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return { url: current, html: new TextDecoder().decode(merged) };
  }
  throw new Error("Website redirected too many times.");
}

function text(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|amp|quot|#39);/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function meta(html: string, key: string) {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:name|property)=["']${key}["'][^>]+content=["']([^"']+)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${key}["']`,
      "i",
    ),
  ];
  return (
    patterns.map((pattern) => html.match(pattern)?.[1]).find(Boolean) ?? ""
  );
}
function title(html: string) {
  return text(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
}

function extractPage(url: URL, htmlInput: string) {
  const html = htmlInput
    .replace(
      /<script(?![^>]+type=["']application\/ld\+json["'])[^>]*>[\s\S]*?<\/script>/gi,
      "",
    )
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<!--([\s\S]*?)-->/g, "");
  const page = {
    url: url.toString(),
    title: title(html),
    description: meta(html, "description") || meta(html, "og:description"),
  };
  const colors = [
    ...new Set(
      (html.match(/#[0-9a-f]{6}\b/gi) ?? []).map((value) =>
        value.toUpperCase(),
      ),
    ),
  ].slice(0, 8);
  const logos = [
    ...new Set(
      [
        ...html.matchAll(
          /<(?:img|link)[^>]+(?:src|href)=["']([^"']+)["'][^>]*(?:logo|icon)|<(?:img|link)[^>]*(?:logo|icon)[^>]+(?:src|href)=["']([^"']+)["']/gi,
        ),
      ]
        .map((match) => match[1] || match[2])
        .filter(Boolean)
        .map((value) => {
          try {
            return new URL(value, url).toString();
          } catch {
            return "";
          }
        })
        .filter(Boolean),
    ),
  ].slice(0, 6);
  const products: Suggestions["products"] = [];
  for (const match of htmlInput.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const parsed = JSON.parse(match[1]);
      const values = Array.isArray(parsed)
        ? parsed
        : parsed["@graph"]
          ? parsed["@graph"]
          : [parsed];
      for (const value of values) {
        const type = String(value?.["@type"] ?? "").toLowerCase();
        if (type.includes("product") || type.includes("service"))
          products.push({
            name: String(value.name ?? "").slice(0, 160),
            description: text(String(value.description ?? "")).slice(0, 2000),
            landingUrl: new URL(String(value.url ?? url), url).toString(),
            kind: type.includes("service") ? "service" : "ecommerce",
          });
      }
    } catch {
      /* Invalid structured data is ignored, never executed. */
    }
  }
  const links = [
    ...new Set(
      [...html.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)]
        .map((match) => {
          try {
            return new URL(match[1], url);
          } catch {
            return null;
          }
        })
        .filter((value): value is URL =>
          Boolean(
            value &&
            value.hostname === url.hostname &&
            ["http:", "https:"].includes(value.protocol),
          ),
        ),
    ),
  ];
  return {
    page,
    colors,
    logos,
    products: products.filter((product) => product.name),
    links,
  };
}

export async function importWebsite(rawUrl: string): Promise<Suggestions> {
  const start = new URL(rawUrl);
  await assertPublicHost(start);
  const originHost = start.hostname;
  const first = await boundedFetch(start, originHost);
  const extracted = extractPage(first.url, first.html);
  const pages = [extracted.page];
  const products = [...extracted.products];
  const colors = [...extracted.colors];
  const logos = [...extracted.logos];
  const candidates = extracted.links
    .filter((url) => /product|service|about/i.test(url.pathname))
    .slice(0, 4);
  for (const candidate of candidates) {
    try {
      const result = await boundedFetch(candidate, originHost);
      const page = extractPage(result.url, result.html);
      pages.push(page.page);
      products.push(...page.products);
      colors.push(...page.colors);
      logos.push(...page.logos);
    } catch {
      /* A single bounded child-page failure does not invalidate safe homepage suggestions. */
    }
  }
  const summary = [extracted.page.title, extracted.page.description]
    .filter(Boolean)
    .join(" — ")
    .slice(0, 1000);
  return {
    summary,
    colors: [...new Set(colors)].slice(0, 8),
    logos: [...new Set(logos)].slice(0, 6),
    products: [
      ...new Map(
        products.map((product) => [
          `${product.kind}:${product.name.toLowerCase()}`,
          product,
        ]),
      ).values(),
    ].slice(0, 30),
    pages,
  };
}
