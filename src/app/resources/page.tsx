import { hasAdminSession } from "@/lib/admin-session";
import { supabaseAdmin } from "@/lib/supabase-admin";
import ResourcesClient from "./resources-client";
export const dynamic = "force-dynamic";
export default async function ResourcesPage() {
  const authorized = await hasAdminSession();
  if (!authorized) return <ResourcesClient authorized={false} personalities={[]}/>;
  const { data, error } = await supabaseAdmin.from("personalities").select("id,canonical_name").order("canonical_name");
  return <ResourcesClient authorized personalities={data || []} loadError={error?.message}/>;
}
