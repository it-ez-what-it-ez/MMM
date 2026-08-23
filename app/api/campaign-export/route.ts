import { demoUserFromCookie } from "@/lib/session";
import { initializeDatabase, loadAppState } from "@/db/runtime";

const csvCell = (value: unknown) =>
  `"${String(value ?? "").replaceAll('"', '""')}"`;

export async function GET(request: Request) {
  await initializeDatabase();
  const campaignId = new URL(request.url).searchParams.get("campaignId");
  if (!campaignId || !/^camp-[a-zA-Z0-9-]+$/.test(campaignId))
    return new Response("Campaign not found", { status: 404 });

  const state = await loadAppState(
    demoUserFromCookie(request.headers.get("cookie")),
  );
  const campaign = state.campaigns.find((item) => item.id === campaignId);
  if (!campaign) return new Response("Campaign not found", { status: 404 });
  const product = state.products.find(
    (item) => item.id === campaign.plan.productId,
  );
  const rows = state.content
    .filter((item) => item.campaignId === campaign.id)
    .map((item) => [
      item.channel,
      item.type,
      item.title,
      item.body,
      item.scheduledAt ?? "",
      item.state,
      product?.productUrl ?? "",
      item.externalId ?? "",
    ]);
  const csv = [
    [
      "channel",
      "type",
      "title",
      "body",
      "scheduled_at",
      "state",
      "target_url",
      "provider_id",
    ],
    ...rows,
  ]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
  const filename = `${campaign.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}-campaign.csv`;

  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
