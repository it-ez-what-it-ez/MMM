import { GrowthOSApp } from "@/app/components/GrowthOSApp";
import { SetupRequired } from "@/app/components/SetupRequired";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AppHome() {
  if (!isSupabaseConfigured()) return <SetupRequired />;
  const supabase = await getServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/");
  return <GrowthOSApp initialPath="/app" initialUser={data.user} />;
}
