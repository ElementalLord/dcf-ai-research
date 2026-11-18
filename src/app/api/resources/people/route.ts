import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { assertCorpusAdmin, assertRequestSize, corpusErrorResponse } from "@/lib/corpus/api";
import { CorpusError } from "@/lib/corpus/errors";
import { personalitySlug } from "@/lib/phase1/dataset";
import { curatedIds, curatedSlugs, loadLiveProfiles } from "@/lib/explore/live-people";
import { exploreProfileSchema, readExploreProfile, type ExploreProfileSettings } from "@/lib/explore/profile-settings";
import { addSourceForPerson, titleFromUrl } from "@/lib/corpus/add-source";
import { getPhase1People } from "@/lib/phase1/dataset";
import { WIKIPEDIA_TITLES } from "@/lib/portraits";
import { exploreCategory } from "@/app/explore/explore-data";
import { profileAngles } from "@/app/explore/profile-angles";

const name = z.string().trim().min(2).max(160);
const alternateNames = z.array(z.string().trim().min(1).max(160)).max(12);
const settingsInput = exploreProfileSchema.omit({ published: true, publishedAt: true });

/** A source to add with the person: a web address, a title, or both. */
const starterSource = z.object({
  title: z.string().trim().max(500).optional().default(""),
  url: z.union([z.string().trim().url().max(2000), z.literal("")]).optional().default(""),
  sourceType: z.enum(["primary_text", "scholarly_book", "scholarly_article", "biography", "autobiography", "archival", "institutional", "other"]).optional().default("other"),
}).refine((item) => item.url || item.title.length >= 2, "Each source needs a web address or a title.");
const sources = z.array(starterSource).max(20);

const createSchema = z.object({ name, alternateNames, categoryId: z.string().uuid(), settings: settingsInput, sources: sources.optional() });
const updateSchema = z.object({
  personalityId: z.string().uuid(),
  name: name.optional(),
  sources: sources.optional(),
  alternateNames: alternateNames.optional(),
  categoryId: z.string().uuid().optional(),
  settings: settingsInput.optional(),
  published: z.boolean().optional(),
});

/** Saves the sources typed into the People form as candidates linked to the person. Returns how many were new. */
async function addStarterSources(personalityId: string, items: z.infer<typeof sources>) {
  let added = 0, reused = 0;
  for (const item of items) {
    const result = await addSourceForPerson({ title: item.title.length >= 2 ? item.title : titleFromUrl(item.url), url: item.url || null, sourceType: item.sourceType }, personalityId);
    if (result.reused) reused += 1; else added += 1;
  }
  return { added, reused };
}

/** Explore details for a curated person as exported, used to pre-fill the form before any edit. */
function curatedDefaults(slug: string): ExploreProfileSettings | null {
  const person = getPhase1People().find((item) => item.slug === slug);
  if (!person) return null;
  const parsed = exploreProfileSchema.safeParse({
    published: true,
    group: exploreCategory(slug).id,
    shortName: person.shortName,
    era: { label: person.era.label, short: person.era.short, sortYear: person.era.sortYear, period: person.era.period },
    region: { label: person.region.label, broad: person.region.broad.slice(0, 4) },
    wikipediaTitle: WIKIPEDIA_TITLES[slug] ?? null,
    photo: null,
    angles: profileAngles(slug).slice(0, 6),
    publishedAt: null,
  });
  return parsed.success ? parsed.data : null;
}

/** Refreshes every page that lists or shows people, so a change appears on the next visit. */
function refreshExplore(slug: string) {
  for (const path of ["/", "/explore", `/explore/${slug}`, "/ai"]) revalidatePath(path);
}

async function categoryExists(id: string) {
  const { data, error } = await supabaseAdmin.from("categories").select("id").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new CorpusError("INVALID_INPUT", "Choose a research category from the list.", 400);
}

async function saveAliases(personalityId: string, canonical: string, alternates: string[]) {
  const rows = [{ alias: canonical, alias_type: "canonical", confidence: 1 }, ...alternates.map((alias) => ({ alias, alias_type: "alternate_name", confidence: 0.95 }))];
  const { data: existing, error } = await supabaseAdmin.from("personality_aliases").select("alias").eq("personality_id", personalityId);
  if (error) throw error;
  const known = new Set((existing || []).map((row) => row.alias.toLowerCase()));
  const fresh = rows.filter((row) => !known.has(row.alias.toLowerCase())).map((row) => ({ ...row, personality_id: personalityId }));
  if (fresh.length) {
    const inserted = await supabaseAdmin.from("personality_aliases").insert(fresh);
    if (inserted.error) throw inserted.error;
  }
}

export async function GET(request: NextRequest) {
  const denied = assertCorpusAdmin(request); if (denied) return denied;
  try {
    const [peopleResult, categoriesResult, live] = await Promise.all([
      supabaseAdmin.from("personalities").select("id,canonical_name,alternate_names,explore_profile,created_at,personality_categories(is_primary,categories(id,name))").order("canonical_name").limit(500),
      supabaseAdmin.from("categories").select("id,slug,name,parameters(parameter_fields(id))").order("name"),
      loadLiveProfiles({ publishedOnly: false }),
    ]);
    if (peopleResult.error || categoriesResult.error) throw peopleResult.error || categoriesResult.error;
    const links = await supabaseAdmin.from("source_personalities").select("personality_id").limit(20000);
    if (links.error) throw links.error;
    const sourceCounts = new Map<string, number>();
    for (const row of links.data || []) sourceCounts.set(row.personality_id, (sourceCounts.get(row.personality_id) || 0) + 1);
    const curated = curatedIds();
    const liveById = new Map(live.map((profile) => [profile.person.id, profile]));
    const people = (peopleResult.data || []).map((row) => {
      const memberships = (row.personality_categories || []) as Array<{ is_primary: boolean | null; categories: { id: string; name: string } | Array<{ id: string; name: string }> | null }>;
      const primary = memberships.find((item) => item.is_primary) ?? memberships[0];
      const category = Array.isArray(primary?.categories) ? primary.categories[0] : primary?.categories;
      const profile = liveById.get(row.id);
      const slug = personalitySlug(row.canonical_name);
      const stored = readExploreProfile(row.explore_profile);
      const isCurated = curated.has(row.id);
      const settings = stored ?? (isCurated ? curatedDefaults(slug) : null);
      return {
        id: row.id,
        name: row.canonical_name,
        slug,
        edited: Boolean(isCurated && stored),
        sourceCount: sourceCounts.get(row.id) || 0,
        alternateNames: row.alternate_names || [],
        category: category ? { id: category.id, name: category.name } : null,
        curated: isCurated,
        settings,
        readiness: profile?.readiness ?? null,
        createdAt: row.created_at,
      };
    });
    const categories = (categoriesResult.data || []).map((row) => ({
      id: row.id, slug: row.slug, name: row.name,
      fieldCount: ((row.parameters || []) as Array<{ parameter_fields: unknown[] | null }>).reduce((total, parameter) => total + (parameter.parameter_fields?.length || 0), 0),
    }));
    return NextResponse.json({ people, categories });
  } catch (error) { return corpusErrorResponse(error); }
}

export async function POST(request: NextRequest) {
  const denied = assertCorpusAdmin(request); if (denied) return denied;
  try {
    assertRequestSize(request, 32 * 1024);
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) throw new CorpusError("INVALID_INPUT", `Check the form: ${parsed.error.issues[0]?.path.join(".") || "a field"} is missing or invalid.`, 400);
    const { name: canonical, alternateNames: alternates, categoryId, settings, sources: starter } = parsed.data;
    const slug = personalitySlug(canonical);
    if (!slug) throw new CorpusError("INVALID_INPUT", "The name needs at least one letter or number.", 400);
    if (curatedSlugs().has(slug)) throw new CorpusError("INVALID_INPUT", `${canonical} is already in the curated collection.`, 409);
    const { data: existing, error: lookupError } = await supabaseAdmin.from("personalities").select("id,canonical_name").limit(1000);
    if (lookupError) throw lookupError;
    const clash = (existing || []).find((row) => personalitySlug(row.canonical_name) === slug);
    if (clash) throw new CorpusError("INVALID_INPUT", `${clash.canonical_name} already exists. Open them in the list instead.`, 409);
    await categoryExists(categoryId);

    const explore: ExploreProfileSettings = { ...settings, published: false, publishedAt: null };
    const { data: created, error } = await supabaseAdmin.from("personalities").insert({
      canonical_name: canonical, alternate_names: alternates, era: settings.era.label, region: settings.region.label,
      research_status: "researching", explore_profile: explore,
    }).select("id").single();
    if (error) throw error;
    const membership = await supabaseAdmin.from("personality_categories").insert({ personality_id: created.id, category_id: categoryId, is_primary: true });
    if (membership.error) {
      await supabaseAdmin.from("personalities").delete().eq("id", created.id);
      throw membership.error;
    }
    await saveAliases(created.id, canonical, alternates);
    revalidatePath("/ai");
    // The person is saved first; a source that fails is reported without undoing the person.
    let sourceResult = { added: 0, reused: 0 }, sourceError: string | null = null;
    if (starter?.length) {
      try { sourceResult = await addStarterSources(created.id, starter); }
      catch (error) { sourceError = error instanceof Error ? error.message : "Some sources could not be saved."; }
    }
    return NextResponse.json({ id: created.id, slug, sources: sourceResult, sourceError });
  } catch (error) { return corpusErrorResponse(error); }
}

export async function PATCH(request: NextRequest) {
  const denied = assertCorpusAdmin(request); if (denied) return denied;
  try {
    assertRequestSize(request, 32 * 1024);
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) throw new CorpusError("INVALID_INPUT", `Check the form: ${parsed.error.issues[0]?.path.join(".") || "a field"} is missing or invalid.`, 400);
    const { personalityId, alternateNames: alternates, categoryId, settings, published, name: newName, sources: starter } = parsed.data;
    const isCurated = curatedIds().has(personalityId);
    if (isCurated && newName) throw new CorpusError("INVALID_INPUT", "Curated profiles keep their name, because their reviewed text and address depend on it.", 409);
    if (isCurated && categoryId) throw new CorpusError("INVALID_INPUT", "Curated profiles keep their research category, because their reviewed claims are filed under it.", 409);
    if (isCurated && published === false) throw new CorpusError("INVALID_INPUT", "Curated profiles are always on Explore.", 409);
    const { data: row, error } = await supabaseAdmin.from("personalities").select("id,canonical_name,explore_profile").eq("id", personalityId).single();
    if (error) throw error;
    const oldSlug = personalitySlug(row.canonical_name);
    const current = readExploreProfile(row.explore_profile) ?? (isCurated ? curatedDefaults(oldSlug) : null);
    const base = settings ?? current;
    if (!base && (settings || published !== undefined)) throw new CorpusError("INVALID_INPUT", "Fill in the Explore details before publishing.", 400);

    let canonical = row.canonical_name;
    if (newName && newName !== row.canonical_name) {
      const slug = personalitySlug(newName);
      if (!slug) throw new CorpusError("INVALID_INPUT", "The name needs at least one letter or number.", 400);
      if (curatedSlugs().has(slug)) throw new CorpusError("INVALID_INPUT", `${newName} is already in the curated collection.`, 409);
      const { data: others, error: lookupError } = await supabaseAdmin.from("personalities").select("id,canonical_name").neq("id", personalityId).limit(1000);
      if (lookupError) throw lookupError;
      const clash = (others || []).find((other) => personalitySlug(other.canonical_name) === slug);
      if (clash) throw new CorpusError("INVALID_INPUT", `${clash.canonical_name} already exists.`, 409);
      canonical = newName;
    }

    if (!base) {
      // Only a rename or new sources, for someone without Explore details yet.
      if (canonical !== row.canonical_name) {
        const renamed = await supabaseAdmin.from("personalities").update({ canonical_name: canonical, updated_at: new Date().toISOString() }).eq("id", personalityId);
        if (renamed.error) throw renamed.error;
        await saveAliases(personalityId, canonical, [row.canonical_name, ...(alternates ?? [])]);
      }
      const sourceResult = starter?.length ? await addStarterSources(personalityId, starter) : { added: 0, reused: 0 };
      revalidatePath("/ai");
      return NextResponse.json({ published: false, sources: sourceResult });
    }

    let next: ExploreProfileSettings = { ...base, published: current?.published ?? false, publishedAt: current?.publishedAt ?? null };
    if (isCurated) next = { ...next, published: true };
    else if (published === true) {
      // Readiness depends only on approved claims and sources, the same check Explore applies to visitors.
      const [profile] = await loadLiveProfiles({ publishedOnly: false, personalityIds: [personalityId] });
      if (!profile) throw new CorpusError("DATABASE_FAILED", "The profile could not be checked. Try again.", 500);
      if (profile.readiness.blockers.length) throw new CorpusError("REVIEW_REQUIRED", `Not ready for Explore yet: ${profile.readiness.blockers.join(" ")}`, 409);
      next = { ...next, published: true, publishedAt: current?.publishedAt ?? new Date().toISOString() };
    }
    if (published === false) next = { ...next, published: false };

    const update: Record<string, unknown> = { explore_profile: next, updated_at: new Date().toISOString() };
    if (settings) Object.assign(update, { era: settings.era.label, region: settings.region.label });
    if (alternates) update.alternate_names = alternates;
    if (canonical !== row.canonical_name) update.canonical_name = canonical;
    const saved = await supabaseAdmin.from("personalities").update(update).eq("id", personalityId);
    if (saved.error) throw saved.error;
    // After a rename the old name stays as an alias, so search and Ask still recognise it.
    if (alternates || canonical !== row.canonical_name) await saveAliases(personalityId, canonical, [...(canonical !== row.canonical_name ? [row.canonical_name] : []), ...(alternates ?? [])]);
    if (categoryId) {
      await categoryExists(categoryId);
      // The person has one research category here, so changing it replaces the old one.
      const set = await supabaseAdmin.from("personality_categories").upsert({ personality_id: personalityId, category_id: categoryId, is_primary: true });
      if (set.error) throw set.error;
      const cleared = await supabaseAdmin.from("personality_categories").delete().eq("personality_id", personalityId).neq("category_id", categoryId);
      if (cleared.error) throw cleared.error;
    }
    let sourceResult = { added: 0, reused: 0 }, sourceError: string | null = null;
    if (starter?.length) {
      try { sourceResult = await addStarterSources(personalityId, starter); }
      catch (error) { sourceError = error instanceof Error ? error.message : "Some sources could not be saved."; }
    }
    refreshExplore(oldSlug);
    if (canonical !== row.canonical_name) refreshExplore(personalitySlug(canonical));
    return NextResponse.json({ published: next.published, slug: personalitySlug(canonical), sources: sourceResult, sourceError });
  } catch (error) { return corpusErrorResponse(error); }
}
