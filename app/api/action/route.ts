import { NextResponse } from "next/server";
import { performAction } from "@/server/actions";
import { demoUserFromCookie } from "@/lib/session";

export async function POST(request: Request) {
  try {
    const result = await performAction(await request.json(), demoUserFromCookie(request.headers.get("cookie")));
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "GrowthOS could not complete that action." }, { status: 500 });
  }
}
