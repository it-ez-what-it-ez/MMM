import { GrowthOSApp } from "@/app/components/GrowthOSApp";
import { SetupRequired } from "@/app/components/SetupRequired";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AppRoute({ params }: { params: Promise<{ slug: string[] }> }) {
  if (!isSupabaseConfigured()) return <SetupRequired />;
  const supabase = await getServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/");
  const resolved = await params;
  return <GrowthOSApp initialPath={`/app/${resolved.slug.join("/")}`} initialUser={data.user} />;
}
