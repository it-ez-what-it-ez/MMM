import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const nextPath = request.nextUrl.searchParams.get("next") ?? "/app";
  const safeNext = nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/app";

  if (!code) return NextResponse.redirect(new URL("/?error=missing_code", request.url));
  const supabase = await getServerSupabase();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(error.message)}`, request.url));
  return NextResponse.redirect(new URL(safeNext, request.url));
}
