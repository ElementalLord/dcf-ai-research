import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { CorpusError } from "./errors";
import { selectPrimaryCategory, type AliasRecord, type PersonalityConfiguration, type TermAliasRecord } from "./personality-config";

type Membership = {
  is_primary: boolean;
  category_id: string;
  categories: { id: string; slug: string; name: string } | Array<{ id: string; slug: string; name: string }> | null;
};

export async function loadPersonalityConfiguration(personalityId: string): Promise<PersonalityConfiguration> {
  const { data: personality, error } = await supabaseAdmin
    .from("personalities")
    .select("id, canonical_name, personality_categories(is_primary, category_id, categories(id, slug, name)), personality_aliases(alias, alias_type, confidence, is_ambiguous)")
    .eq("id", personalityId)
    .single();
  if (error || !personality) {
    throw new CorpusError("RETRIEVAL_FAILED", "The selected personality could not be loaded.", 404, { cause: error });
  }
  const membership = selectPrimaryCategory((personality.personality_categories || []) as Membership[]);
  if (!membership) throw new CorpusError("RETRIEVAL_FAILED", "The personality has no research category.", 422);
  const category = Array.isArray(membership.categories) ? membership.categories[0] : membership.categories;
  const { data: termRows, error: termError } = await supabaseAdmin
    .from("research_term_aliases")
    .select("canonical_term, alias")
    .or(`category_id.eq.${membership.category_id},category_id.is.null`);
  if (termError) throw new CorpusError("DATABASE_FAILED", "Research aliases could not be loaded.", 500, { cause: termError });

  return {
    personalityId: personality.id,
    canonicalName: personality.canonical_name,
    categoryId: membership.category_id,
    categorySlug: category?.slug || null,
    categoryName: category?.name || null,
    aliases: ((personality.personality_aliases || []) as Array<Record<string, unknown>>).map((row): AliasRecord => ({
      alias: String(row.alias),
      aliasType: row.alias_type ? String(row.alias_type) : null,
      confidence: row.confidence == null ? null : Number(row.confidence),
      isAmbiguous: Boolean(row.is_ambiguous),
    })),
    termAliases: (termRows || []).map((row): TermAliasRecord => ({
      canonicalTerm: row.canonical_term,
      alias: row.alias,
    })),
  };
}
