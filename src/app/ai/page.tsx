import AskClient, { type Personality } from "../ask/ask-client";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { relevantLenses } from "@/lib/ask/lenses";
import { primaryCategoryName } from "@/lib/personality-groups";
import { getPortraits, slugForName, type Portrait } from "@/lib/portraits";
import { exploreCategory } from "../explore/explore-data";
import { readExploreProfile } from "@/lib/explore/profile-settings";
export const dynamic = "force-dynamic";
const photoPortrait = (photo: { url: string; credit: string } | null | undefined): Portrait | null =>
  photo ? { src: photo.url, author: photo.credit || "Dharma Civilization Foundation", license: "Used with permission", source: photo.url } : null;
type Row = { id: string; canonical_name: string; explore_profile: unknown; personality_categories: Array<{ is_primary: boolean | null; categories: { slug: string; name: string } | Array<{ slug: string; name: string }> | null }> | null };
export default async function AiPage() {
  const { data, error } = await supabaseAdmin.from("personalities").select("id,canonical_name,explore_profile,personality_categories(is_primary,categories(slug,name))").order("canonical_name");
  const personalities: Array<Personality & { group: string | null; wikipediaTitle: string | null; photo: Portrait | null }> = ((data || []) as Row[]).map((row) => ({
    id: row.id,
    canonical_name: row.canonical_name,
    group: readExploreProfile(row.explore_profile)?.group ?? null,
    wikipediaTitle: readExploreProfile(row.explore_profile)?.wikipediaTitle ?? null,
    photo: photoPortrait(readExploreProfile(row.explore_profile)?.photo),
    category: primaryCategoryName(row.personality_categories),
    // Only the angles that suit this person's field are offered.
    lenses: relevantLenses((row.personality_categories || []).flatMap((membership) => Array.isArray(membership.categories) ? membership.categories : membership.categories ? [membership.categories] : []).map((category) => category.slug))
      .map((lens) => ({ id: lens.id, label: lens.label })),
  }));
  // Portraits and the five Explore fields make the picker a page of faces rather than a list of names.
  const titles = Object.fromEntries(personalities.flatMap((person) => person.wikipediaTitle ? [[slugForName(person.canonical_name), person.wikipediaTitle]] : []));
  const photos = Object.fromEntries(personalities.flatMap((person) => person.photo ? [[slugForName(person.canonical_name), person.photo]] : []));
  const portraits = await getPortraits(personalities.map((person) => slugForName(person.canonical_name)), titles, photos);
  const withFaces = personalities.map((entry) => {
    const { group, ...person } = entry;
    delete (person as { wikipediaTitle?: string | null }).wikipediaTitle;
    delete (person as { photo?: Portrait | null }).photo;
    const slug = slugForName(person.canonical_name);
    return { ...person, slug, field: exploreCategory(slug, group).id, portrait: portraits[slug] ?? null };
  });
  return <AskClient personalities={withFaces} loadError={error ? `Could not load personalities: ${error.message}` : ""}/>;
}
