import "server-only";

import { cache } from "react";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getPhase1People, personalitySlug } from "@/lib/phase1/dataset";
import { buildLiveProfile, type LiveClaimRow, type LivePersonRow, type LiveProfileResult, type LiveSourceRow } from "./build-live-profile";
import { readExploreProfile, type ExploreProfileSettings } from "./profile-settings";

export type LiveProfile = LiveProfileResult & { settings: ExploreProfileSettings };

const PERSON_SELECT = "id,canonical_name,alternate_names,explore_profile,personality_categories(is_primary,categories(id,slug,name))";
const CLAIM_SELECT = "id,personality_id,claim_text,claim_kind,certainty,review_status,approval_origin,evidence_type,parameter_fields(code,label,parameters(code,name)),claim_sources(source_id,relationship,evidence_excerpt,page_or_section)";
const SOURCE_SELECT = "id,title,author,publisher_or_institution,publication_year,source_type,textual_layer,url,citation,rights_or_access_note,source_status,approval_origin";

/** IDs of the 25 curated Phase 1 profiles. Those always come from the checked-in export. */
export function curatedIds() {
  return new Set(getPhase1People().map((person) => person.id));
}

export function curatedSlugs() {
  return new Set(getPhase1People().map((person) => person.slug));
}

/**
 * Explore profiles for people added through Resources → People, built live from the database.
 * `publishedOnly` limits it to what visitors may see. Any database failure returns an empty list,
 * so the curated collection keeps working.
 */
export async function loadLiveProfiles({ publishedOnly, personalityIds }: { publishedOnly: boolean; personalityIds?: string[] }): Promise<LiveProfile[]> {
  try {
    let query = supabaseAdmin.from("personalities").select(PERSON_SELECT).not("explore_profile", "is", null);
    if (publishedOnly) query = query.eq("explore_profile->>published", "true");
    if (personalityIds) query = query.in("id", personalityIds);
    const { data: people, error } = await query.order("canonical_name").limit(500);
    if (error) throw error;
    const curated = curatedIds();
    const takenSlugs = curatedSlugs();
    const rows = (people || []).flatMap((row) => {
      const settings = readExploreProfile(row.explore_profile);
      const slug = personalitySlug(row.canonical_name);
      return settings && !curated.has(row.id) && !takenSlugs.has(slug) ? [{ row: row as unknown as LivePersonRow, settings, slug }] : [];
    });
    if (!rows.length) return [];
    const ids = rows.map((item) => item.row.id);

    const [claimsResult, linksResult] = await Promise.all([
      supabaseAdmin.from("claims").select(CLAIM_SELECT).in("personality_id", ids).neq("review_status", "rejected").limit(5000),
      supabaseAdmin.from("source_personalities").select("personality_id,source_id").in("personality_id", ids).limit(5000),
    ]);
    if (claimsResult.error) throw claimsResult.error;
    if (linksResult.error) throw linksResult.error;
    const claims = (claimsResult.data || []) as unknown as Array<LiveClaimRow & { personality_id: string }>;
    const sourceIdsByPerson = new Map<string, Set<string>>(ids.map((id) => [id, new Set()]));
    for (const link of linksResult.data || []) sourceIdsByPerson.get(link.personality_id)?.add(link.source_id);
    for (const claim of claims) for (const link of claim.claim_sources || []) sourceIdsByPerson.get(claim.personality_id)?.add(link.source_id);
    const allSourceIds = [...new Set([...sourceIdsByPerson.values()].flatMap((set) => [...set]))];
    const sourcesResult = allSourceIds.length
      ? await supabaseAdmin.from("sources").select(SOURCE_SELECT).in("id", allSourceIds).neq("source_status", "rejected").limit(5000)
      : { data: [], error: null };
    if (sourcesResult.error) throw sourcesResult.error;
    const sourceMap = new Map(((sourcesResult.data || []) as LiveSourceRow[]).map((source) => [source.id, source]));

    return rows.map(({ row, settings, slug }) => {
      const personSources = [...(sourceIdsByPerson.get(row.id) ?? [])].map((id) => sourceMap.get(id)).filter((source): source is LiveSourceRow => Boolean(source))
        .sort((a, b) => a.title.localeCompare(b.title));
      return { ...buildLiveProfile(row, settings, claims.filter((claim) => claim.personality_id === row.id), personSources, slug), settings };
    }).filter((profile) => !publishedOnly || profile.readiness.blockers.length === 0);
  } catch (error) {
    console.error("Explore: live profiles could not be loaded.", error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Edits made in Resources → People to the 25 curated profiles, keyed by person ID. Only the
 * presentation details change (names, era, place, group, photo, angles); reviewed text stays as
 * exported. A database failure returns no edits, so the curated collection always loads.
 */
export async function loadCuratedEdits(): Promise<Map<string, { settings: ExploreProfileSettings; alternateNames: string[] | null }>> {
  try {
    const { data, error } = await supabaseAdmin.from("personalities").select("id,alternate_names,explore_profile").in("id", [...curatedIds()]).not("explore_profile", "is", null);
    if (error) throw error;
    return new Map((data || []).flatMap((row) => {
      const settings = readExploreProfile(row.explore_profile);
      return settings ? [[row.id, { settings, alternateNames: row.alternate_names }]] : [];
    }));
  } catch (error) {
    console.error("Explore: curated edits could not be loaded.", error instanceof Error ? error.message : error);
    return new Map();
  }
}

export const curatedEdits = cache(loadCuratedEdits);

/** Published live profiles, deduplicated per request. */
export const publishedLiveProfiles = cache(() => loadLiveProfiles({ publishedOnly: true }));
