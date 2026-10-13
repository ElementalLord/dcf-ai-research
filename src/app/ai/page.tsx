import AskClient, { type Personality } from "../ask/ask-client";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { relevantLenses } from "@/lib/ask/lenses";
import { primaryCategoryName } from "@/lib/personality-groups";
export const dynamic = "force-dynamic";
type Row = { id: string; canonical_name: string; personality_categories: Array<{ is_primary: boolean | null; categories: { slug: string; name: string } | Array<{ slug: string; name: string }> | null }> | null };
export default async function AiPage() {
  const { data, error } = await supabaseAdmin.from("personalities").select("id,canonical_name,personality_categories(is_primary,categories(slug,name))").order("canonical_name");
  const personalities: Personality[] = ((data || []) as Row[]).map((row) => ({
    id: row.id,
    canonical_name: row.canonical_name,
    category: primaryCategoryName(row.personality_categories),
    // Only the angles that suit this person's field are offered.
    lenses: relevantLenses((row.personality_categories || []).flatMap((membership) => Array.isArray(membership.categories) ? membership.categories : membership.categories ? [membership.categories] : []).map((category) => category.slug))
      .map((lens) => ({ id: lens.id, label: lens.label })),
  }));
  return <AskClient personalities={personalities} loadError={error ? `Could not load personalities: ${error.message}` : ""}/>;
}
