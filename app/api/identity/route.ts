import { NextResponse } from "next/server";
import { z } from "zod";
import { loadAppState } from "@/db/runtime";

const schema = z.object({ userId: z.string() });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  const state = await loadAppState(parsed.data.userId);
  if (!state.users.some((user) => user.id === parsed.data.userId)) return NextResponse.json({ ok: false }, { status: 404 });
  const response = NextResponse.json({ ok: true });
  response.headers.append("Set-Cookie", `growthos_demo_user=${encodeURIComponent(parsed.data.userId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
  return response;
}
