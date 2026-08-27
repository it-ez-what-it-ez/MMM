import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { authorizationErrorResponse, requireApiUser, requireWorkspaceRole } from "@/server/v1/auth";

const schema = z.object({ workspaceId: z.string().uuid() });

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const input = schema.parse(Object.fromEntries(new URL(request.url).searchParams));
    await requireWorkspaceRole(user.id, input.workspaceId, ["owner", "admin", "marketer"]);
    const admin = getSupabaseAdmin();
    const [{ data: lists }, { data: settings }] = await Promise.all([
      admin.from("contact_lists").select("id,name,description").eq("workspace_id", input.workspaceId).order("name"),
      admin.from("messaging_settings").select("legal_business_name,physical_address,default_country,quiet_hours_start,quiet_hours_end").eq("workspace_id", input.workspaceId).maybeSingle(),
    ]);
    const summaries = [];
    for (const list of lists ?? []) {
      const { data: members } = await admin.from("contact_list_members").select("contact_id").eq("workspace_id", input.workspaceId).eq("list_id", list.id).limit(10000);
      const ids = (members ?? []).map((entry) => entry.contact_id);
      const counts = { email: 0, sms: 0 };
      if (ids.length) {
        const [{ data: consents }, { data: suppressions }] = await Promise.all([
          admin.from("communication_consents").select("contact_id,channel").eq("workspace_id", input.workspaceId).eq("status", "subscribed").in("contact_id", ids),
          admin.from("suppressions").select("contact_id,channel").eq("workspace_id", input.workspaceId).in("contact_id", ids),
        ]);
        const blocked = new Set((suppressions ?? []).map((entry) => `${entry.channel}:${entry.contact_id}`));
        for (const consent of consents ?? [])
          if (!blocked.has(`${consent.channel}:${consent.contact_id}`)) counts[consent.channel as "email" | "sms"] += 1;
      }
      summaries.push({ ...list, totalContacts: ids.length, eligible: counts });
    }
    return Response.json({ ok: true, data: { lists: summaries, settings } });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ ok: false, errors: error.issues }, { status: 400 });
    return authorizationErrorResponse(error);
  }
}
