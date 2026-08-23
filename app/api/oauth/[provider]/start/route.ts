import { NextResponse } from "next/server";
import { demoUserFromCookie } from "@/lib/session";
import {
  createProviderAuthorizationUrl,
  isOAuthProvider,
} from "@/server/provider-oauth";

function errorRedirect(request: Request, message: string) {
  const url = new URL("/app/integrations", request.url);
  url.searchParams.set("connect_error", message);
  return NextResponse.redirect(url);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;
  if (!isOAuthProvider(provider))
    return NextResponse.json({ error: "Unknown advertising provider." }, { status: 404 });
  try {
    const userId = demoUserFromCookie(request.headers.get("cookie"));
    const url = await createProviderAuthorizationUrl(request, provider, userId);
    return NextResponse.redirect(url);
  } catch (error) {
    return errorRedirect(
      request,
      error instanceof Error ? error.message : "The provider login could not start.",
    );
  }
}
