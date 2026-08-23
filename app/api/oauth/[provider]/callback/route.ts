import { NextResponse } from "next/server";
import { demoUserFromCookie } from "@/lib/session";
import {
  completeProviderOAuth,
  isOAuthProvider,
} from "@/server/provider-oauth";

export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;
  if (!isOAuthProvider(provider))
    return NextResponse.json({ error: "Unknown advertising provider." }, { status: 404 });
  try {
    const userId = demoUserFromCookie(request.headers.get("cookie"));
    const result = await completeProviderOAuth(request, provider, userId);
    const url = new URL(result.returnTo, request.url);
    url.searchParams.set("provider", provider);
    url.searchParams.set("connection", result.connectionId);
    url.searchParams.set("connected", "1");
    return NextResponse.redirect(url);
  } catch (error) {
    const url = new URL("/app/integrations", request.url);
    url.searchParams.set(
      "connect_error",
      error instanceof Error ? error.message : "The provider login could not finish.",
    );
    return NextResponse.redirect(url);
  }
}
