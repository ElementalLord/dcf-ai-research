import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { assertCorpusAdmin, assertRequestSize, corpusErrorResponse } from "@/lib/corpus/api";
import { CorpusError } from "@/lib/corpus/errors";
import { personalitySlug } from "@/lib/phase1/dataset";
import { curatedIds, curatedSlugs, loadLiveProfiles } from "@/lib/explore/live-people";
import { exploreProfileSchema, readExploreProfile, type ExploreProfileSettings } from "@/lib/explore/profile-settings";

const name = z.string().trim().min(2).max(160);
const alternateNames = z.array(z.string().trim().min(1).max(160)).max(12);
const settingsInput = exploreProfileSchema.omit({ published: true, publishedAt: true });

const createSchema = z.object({ name, alternateNames, categoryId: z.string().uuid(), settings: settingsInput });
const updateSchema = z.object({
  personalityId: z.string().uuid(),
  alternateNames: alternateNames.optional(),
  categoryId: z.string().uuid().optional(),
  settings: settingsInput.optional(),
  published: z.boolean().optional(),
});

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
    const curated = curatedIds();
    const liveById = new Map(live.map((profile) => [profile.person.id, profile]));
    const people = (peopleResult.data || []).map((row) => {
      const memberships = (row.personality_categories || []) as Array<{ is_primary: boolean | null; categories: { id: string; name: string } | Array<{ id: string; name: string }> | null }>;
      const primary = memberships.find((item) => item.is_primary) ?? memberships[0];
      const category = Array.isArray(primary?.categories) ? primary.categories[0] : primary?.categories;
      const profile = liveById.get(row.id);
      const settings = readExploreProfile(row.explore_profile);
      return {
        id: row.id,
        name: row.canonical_name,
        slug: personalitySlug(row.canonical_name),
        alternateNames: row.alternate_names || [],
        category: category ? { id: category.id, name: category.name } : null,
        curated: curated.has(row.id),
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
    const { name: canonical, alternateNames: alternates, categoryId, settings } = parsed.data;
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
    return NextResponse.json({ id: created.id, slug });
  } catch (error) { return corpusErrorResponse(error); }
}

export async function PATCH(request: NextRequest) {
  const denied = assertCorpusAdmin(request); if (denied) return denied;
  try {
    assertRequestSize(request, 32 * 1024);
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) throw new CorpusError("INVALID_INPUT", `Check the form: ${parsed.error.issues[0]?.path.join(".") || "a field"} is missing or invalid.`, 400);
    const { personalityId, alternateNames: alternates, categoryId, settings, published } = parsed.data;
    if (curatedIds().has(personalityId)) throw new CorpusError("REVIEW_REQUIRED", "The 25 curated profiles are managed through the Phase 1 export, not here.", 409);
    const { data: row, error } = await supabaseAdmin.from("personalities").select("id,canonical_name,explore_profile").eq("id", personalityId).single();
    if (error) throw error;
    const current = readExploreProfile(row.explore_profile);
    const base = settings ?? current;
    if (!base) throw new CorpusError("INVALID_INPUT", "Fill in the Explore details before publishing.", 400);

    let next: ExploreProfileSettings = { ...base, published: current?.published ?? false, publishedAt: current?.publishedAt ?? null };
    if (published === true) {
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
    const saved = await supabaseAdmin.from("personalities").update(update).eq("id", personalityId);
    if (saved.error) throw saved.error;
    if (alternates) await saveAliases(personalityId, row.canonical_name, alternates);
    if (categoryId) {
      await categoryExists(categoryId);
      // The person has one research category here, so changing it replaces the old one.
      const set = await supabaseAdmin.from("personality_categories").upsert({ personality_id: personalityId, category_id: categoryId, is_primary: true });
      if (set.error) throw set.error;
      const cleared = await supabaseAdmin.from("personality_categories").delete().eq("personality_id", personalityId).neq("category_id", categoryId);
      if (cleared.error) throw cleared.error;
    }
    refreshExplore(personalitySlug(row.canonical_name));
    return NextResponse.json({ published: next.published });
  } catch (error) { return corpusErrorResponse(error); }
}
