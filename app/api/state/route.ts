import { NextResponse } from "next/server";
import { loadAppState } from "@/db/runtime";
import { demoUserFromCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return NextResponse.json(await loadAppState(demoUserFromCookie(request.headers.get("cookie"))));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load GrowthOS." }, { status: 500 });
  }
}
