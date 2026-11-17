import { hasAdminSession } from "@/lib/admin-session";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { primaryCategoryName, type CategoryMembership } from "@/lib/personality-groups";
import ResourcesClient from "./resources-client";
export const dynamic = "force-dynamic";
export default async function ResourcesPage({ searchParams }: { searchParams: Promise<{ person?: string | string[] }> }) {
  const authorized = await hasAdminSession();
  if (!authorized) return <ResourcesClient authorized={false} personalities={[]}/>;
  const { data, error } = await supabaseAdmin.from("personalities").select("id,canonical_name,personality_categories(is_primary,categories(name))").order("canonical_name");
  const personalities = (data || []).map((row) => ({ id: row.id, canonical_name: row.canonical_name, category: primaryCategoryName(row.personality_categories as CategoryMembership[]) }));
  const requested = (await searchParams).person;
  const initialPersonId = typeof requested === "string" && personalities.some((person) => person.id === requested) ? requested : undefined;
  return <ResourcesClient authorized personalities={personalities} initialPersonId={initialPersonId} loadError={error?.message}/>;
}
