import { GrowthOSApp } from "@/app/components/GrowthOSApp";
import { SetupRequired } from "@/app/components/SetupRequired";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AppRoute({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!isSupabaseConfigured()) return <SetupRequired />;
  const supabase = await getServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/");
  const resolved = await params;
  const query = await searchParams;
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  const connectionError = first(query.connection_error);
  const connected = first(query.connected);
  return (
    <GrowthOSApp
      initialPath={`/app/${resolved.slug.join("/")}`}
      initialUser={data.user}
      initialConnectionNotice={
        connectionError
          ? { type: "error", message: connectionError }
          : connected
            ? {
                type: "success",
                message: `${connected.replaceAll("_", " ")} authorization succeeded. Choose the exact destinations to continue.`,
              }
            : undefined
      }
    />
  );
}
