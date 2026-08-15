import { GrowthOSApp } from "@/app/components/GrowthOSApp";

export const dynamic = "force-dynamic";

export default async function AppRoute({ params }: { params: Promise<{ slug: string[] }> }) {
  const resolved = await params;
  return <GrowthOSApp initialPath={`/app/${resolved.slug.join("/")}`} />;
}
