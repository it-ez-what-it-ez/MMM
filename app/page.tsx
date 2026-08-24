import { redirect } from "next/navigation";
import { AuthScreen } from "@/app/components/AuthScreen";
import { SetupRequired } from "@/app/components/SetupRequired";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!isSupabaseConfigured()) return <SetupRequired />;
  const supabase = await getServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/app");
  const params = await searchParams;
  return <AuthScreen errorMessage={params.error ? decodeURIComponent(params.error) : undefined} />;
}
