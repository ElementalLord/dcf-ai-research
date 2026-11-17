import type { Phase1Personality, Phase1SectionKey, Phase1Source, Phase1Statement } from "@/lib/phase1/types";
import { EXPLORE_GROUPS, type ExploreProfileSettings } from "./profile-settings";

/**
 * Builds an Explore profile for a person added through Resources → People, straight from database
 * rows. It follows the Phase 1 export's rules (scripts/export-phase1-personalities.mjs): only
 * approved claims backed by an approved source appear, each claim goes to a section by its research
 * field, contested claims need two independent approved sources (one primary or scholarly), and an
 * empty section gets a limited-information note instead of invented text. Pure, so it can be tested.
 */

export type LiveSourceRow = {
  id: string; title: string; author: string | null; publisher_or_institution: string | null; publication_year: number | null;
  source_type: string | null; textual_layer: string | null; url: string | null; citation: string | null;
  rights_or_access_note: string | null; source_status: string; approval_origin: string | null;
};

type One<T> = T | T[] | null | undefined;

export type LiveClaimRow = {
  id: string; claim_text: string; claim_kind: string | null; certainty: string | null; review_status: string;
  approval_origin: string | null; evidence_type: string | null;
  parameter_fields: One<{ code: string; label: string; parameters: One<{ code: string; name: string }> }>;
  claim_sources: Array<{ source_id: string; relationship: string; evidence_excerpt: string | null; page_or_section: string | null }> | null;
};

export type LivePersonRow = {
  id: string; canonical_name: string; alternate_names: string[] | null;
  personality_categories: Array<{ is_primary: boolean | null; categories: One<{ id: string; slug: string; name: string }> }> | null;
};

const one = <T,>(value: One<T>): T | null => (Array.isArray(value) ? value[0] ?? null : value ?? null);
const unique = <T,>(values: T[]) => [...new Set(values)];
const sentence = (text: string) => {
  const clean = text.replace(/\s+/g, " ").trim();
  return !clean || /[.!?]$/.test(clean) ? clean : `${clean}.`;
};

type Bucket = "lifeAndContext" | "qualitiesValues" | "contributions" | "challenges" | "leadershipRelational" | "contestedAspects" | "contemporaryRelevance";

// Same order and patterns as the Phase 1 exporter, so a field lands in the same section either way.
const SECTION_RULES: Array<[Bucket, RegExp]> = [
  ["contestedAspects", /contested|controvers|sensitive|criticism|myth_history|sensationalized|mentor_review/i],
  ["contemporaryRelevance", /contemporary|legacy|impact|recognition|continuing|public memory|cultural_reach|farmer_impact|national_development|social_service|service/i],
  ["leadershipRelational", /leadership|relationships?|people|mentorship|lineage|parampara|social_role|diplomacy|court_family|collaborat|contemporar|guru|disciple/i],
  ["challenges", /challenges?|persistence|detention|conflict|trade-offs?|limits?|limitations?|interpretation|complexity/i],
  ["qualitiesValues", /qualities?|values?|virtues?|inner_qualities|philosophy|teachings?|ideas|ideology|practice|tapas|sadhana|doctrinal|human questions/i],
  ["lifeAndContext", /formation|vocation|role|scientific_role|identity|early life|background|historical_context|historical setting|sector_context|context|era|lineage|career/i],
  ["contributions", /.*/i],
];

const SECTION_TITLES: Record<Phase1SectionKey, string> = {
  lifeAndContext: "life and context",
  qualitiesValues: "qualities and values",
  contributions: "contributions",
  challenges: "challenges",
  leadershipRelationalCharacteristics: "leadership and relationships",
  contemporaryRelevance: "recognition and legacy",
  contestedAspects: "disputed or uncertain questions",
};

const CATEGORY_LENSES: Record<string, string[]> = {
  rishi: ["philosophical", "spiritual", "textual", "educational", "social", "historical"],
  spiritual_teacher: ["spiritual", "philosophical", "educational", "social", "cultural", "historical", "institutional"],
  scientist: ["scientific", "educational", "institutional", "national"],
  political_leader: ["political", "military", "administrative", "economic", "cultural", "architectural", "maritime"],
  ruler: ["political", "military", "administrative", "economic", "cultural", "architectural", "maritime"],
  warriors_freedom_fighters: ["political", "military", "leadership", "international", "historical", "national"],
  educator_social_reformer: ["educational", "social", "cultural", "political", "institutional", "literary"],
  social_entrepreneur: ["economic", "social", "agricultural", "institutional", "technological", "leadership", "rural_development"],
  business_institution_builder: ["economic", "institutional", "technological", "leadership", "national", "social"],
  musician_performer: ["artistic", "cultural", "social", "gender", "institutional", "spiritual", "international"],
  cultural_figure: ["artistic", "literary", "cultural", "philosophical", "social", "political", "international"],
};

function fieldText(claim: LiveClaimRow) {
  const field = one(claim.parameter_fields);
  const parameter = one(field?.parameters);
  return [parameter?.code, parameter?.name, field?.code, field?.label].filter(Boolean).join(" ");
}

function isSensitive(claim: LiveClaimRow) {
  return /contested/i.test(`${claim.claim_kind || ""} ${claim.evidence_type || ""}`) || /contested|controvers|sensitive|criticism/i.test(fieldText(claim));
}

function bucketFor(claim: LiveClaimRow): Bucket {
  if (isSensitive(claim)) return "contestedAspects";
  const haystack = fieldText(claim);
  return SECTION_RULES.find(([, pattern]) => pattern.test(haystack))?.[0] ?? "contributions";
}

const independenceKey = (source: LiveSourceRow) => {
  try { if (source.url) return new URL(source.url).hostname.toLowerCase().replace(/^www\./, ""); } catch { /* fall through */ }
  return source.publisher_or_institution?.toLowerCase() || source.author?.toLowerCase() || source.id;
};
const primaryOrScholarly = (source: LiveSourceRow) => /primary|scholarly/i.test(`${source.source_type || ""} ${source.textual_layer || ""}`);

export type LiveProfileReadiness = {
  shownClaims: number;
  shownSources: number;
  approvedClaims: number;
  pendingClaims: number;
  approvedSources: number;
  withheldContested: number;
  filledSections: string[];
  emptySections: string[];
  /** Reasons the profile cannot be published yet. Empty means it can. */
  blockers: string[];
};

export type LiveProfileResult = { person: Phase1Personality; readiness: LiveProfileReadiness };

export function buildLiveProfile(row: LivePersonRow, settings: ExploreProfileSettings, claims: LiveClaimRow[], sources: LiveSourceRow[], slug: string): LiveProfileResult {
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const approvedSourceIds = new Set(sources.filter((source) => source.source_status === "approved").map((source) => source.id));
  let withheldContested = 0;

  const eligible = claims.flatMap((claim) => {
    if (claim.review_status !== "approved") return [];
    const refs = (claim.claim_sources || []).filter((link) => link.relationship === "supports" && approvedSourceIds.has(link.source_id));
    if (!refs.length) return [];
    if (isSensitive(claim)) {
      const linked = refs.map((link) => sourceMap.get(link.source_id)!);
      if (unique(linked.map(independenceKey)).length < 2 || !linked.some(primaryOrScholarly)) { withheldContested += 1; return []; }
    }
    return [{ claim, refs }];
  });

  const rank = (item: (typeof eligible)[number]) => ({ high: 3, medium: 2, low: 1 }[item.claim.certainty || ""] ?? 0) * 20
    + Math.min(item.refs.length, 4) * 5 + (item.claim.claim_text.length >= 45 && item.claim.claim_text.length <= 360 ? 10 : 0);
  const sortRanked = (items: typeof eligible) => [...items].sort((a, b) => rank(b) - rank(a) || a.claim.claim_text.localeCompare(b.claim.claim_text));

  const statement = ({ claim, refs }: (typeof eligible)[number]): Phase1Statement => {
    const field = one(claim.parameter_fields);
    const parameter = one(field?.parameters);
    return {
      claimId: claim.id,
      text: sentence(claim.claim_text),
      reviewStatus: claim.review_status,
      approvalOrigin: claim.approval_origin || "human_manual",
      certainty: claim.certainty || "unknown",
      evidenceType: claim.evidence_type || "uncertain",
      claimKind: claim.claim_kind || "established_fact",
      framework: field ? { parameterCode: parameter?.code ?? null, parameterName: parameter?.name ?? null, fieldCode: field.code, fieldLabel: field.label } : null,
      citations: refs.map((link) => ({ sourceId: link.source_id, relationship: link.relationship, locator: link.page_or_section, evidenceExcerpt: link.evidence_excerpt })),
    };
  };

  // Unlike the 25 curated profiles, there is no hand-picked cap here: every approved, sourced claim is shown.
  const buckets = Object.fromEntries((["lifeAndContext", "qualitiesValues", "contributions", "challenges", "leadershipRelational", "contestedAspects", "contemporaryRelevance"] as Bucket[])
    .map((key) => [key, sortRanked(eligible.filter((item) => bucketFor(item.claim) === key)).map(statement)])) as Record<Bucket, Phase1Statement[]>;

  const shortIntroduction = [...buckets.lifeAndContext, ...buckets.contributions, ...buckets.qualitiesValues].slice(0, 2);
  const sections: Record<Phase1SectionKey, Phase1Statement[]> = {
    lifeAndContext: buckets.lifeAndContext,
    qualitiesValues: buckets.qualitiesValues,
    contributions: buckets.contributions,
    challenges: buckets.challenges,
    leadershipRelationalCharacteristics: buckets.leadershipRelational,
    contemporaryRelevance: buckets.contemporaryRelevance,
    contestedAspects: buckets.contestedAspects,
  };

  const limitedInformation: Partial<Record<Phase1SectionKey, string>> = {};
  for (const key of Object.keys(sections) as Phase1SectionKey[]) {
    if (sections[key].length) continue;
    limitedInformation[key] = key === "contestedAspects"
      ? withheldContested
        ? `${withheldContested} contested or sensitive ${withheldContested === 1 ? "statement is" : "statements are"} withheld until each has two independent approved sources, at least one primary or scholarly.`
        : `No contested or sensitive claims about ${row.canonical_name} are recorded in the approved sources of this collection.`
      : `The approved sources in this collection do not yet document ${SECTION_TITLES[key]} for ${row.canonical_name}.`;
  }

  const memberships = (row.personality_categories || []).map((membership) => ({ membership, category: one(membership.categories) })).filter((item) => item.category);
  const primary = memberships.find((item) => item.membership.is_primary) ?? memberships[0];
  const detailed = memberships.map(({ membership, category }) => ({ categoryId: category!.id, slug: category!.slug, name: category!.name, isPrimary: Boolean(membership.is_primary) }));
  const group = EXPLORE_GROUPS.find((item) => item.id === settings.group)!;
  const shownStatements = [...shortIntroduction, ...Object.values(sections).flat()];
  const citedSourceIds = unique(shownStatements.flatMap((item) => item.citations.map((citation) => citation.sourceId)));
  const publicSources: Phase1Source[] = sources.map((source) => ({
    id: source.id, title: source.title, author: source.author, publisherOrInstitution: source.publisher_or_institution,
    publicationYear: source.publication_year, sourceType: source.source_type || "other", textualLayer: source.textual_layer,
    url: source.url, citation: source.citation, rightsOrAccessNote: source.rights_or_access_note,
    sourceStatus: source.source_status, approvalOrigin: source.approval_origin || "human_manual",
  }));

  const blockers: string[] = [];
  if (!approvedSourceIds.size) blockers.push("Approve at least one source.");
  if (!shortIntroduction.length) blockers.push("Approve at least one claim that cites an approved source. The first approved claims become the overview.");

  const person: Phase1Personality = {
    id: row.id,
    slug,
    name: row.canonical_name,
    shortName: settings.shortName,
    alternateNames: row.alternate_names || [],
    type: primary?.category?.name ?? null,
    category: detailed.find((item) => item.isPrimary) ?? detailed[0] ?? null,
    categories: detailed,
    phase1PresentationCategory: { id: group.id, name: group.name, description: "" },
    phase1PresentationCategoryStatus: "published_from_resources",
    era: { ...settings.era, supportingClaimIds: [] },
    region: { ...settings.region, supportingClaimIds: [] },
    shortIntroduction,
    ...sections,
    limitedInformation,
    studyFramework: null,
    roleLenses: [],
    lenses: unique(detailed.flatMap((item) => CATEGORY_LENSES[item.slug ?? ""] ?? [])),
    sources: publicSources,
    citations: citedSourceIds,
    reviewStatus: { mentorApproval: "not_applicable", profileDraftStatus: blockers.length ? "blocked_pending_evidence" : "published_from_resources", unresolvedConcerns: blockers },
  };

  const filled = (Object.keys(sections) as Phase1SectionKey[]).filter((key) => key !== "contestedAspects" && sections[key].length);
  return {
    person,
    readiness: {
      shownClaims: new Set(shownStatements.map((item) => item.claimId)).size,
      shownSources: citedSourceIds.length,
      approvedClaims: claims.filter((claim) => claim.review_status === "approved").length,
      pendingClaims: claims.filter((claim) => claim.review_status === "draft" || claim.review_status === "needs_review").length,
      approvedSources: approvedSourceIds.size,
      withheldContested,
      filledSections: filled.map((key) => SECTION_TITLES[key]),
      emptySections: (Object.keys(sections) as Phase1SectionKey[]).filter((key) => key !== "contestedAspects" && !sections[key].length).map((key) => SECTION_TITLES[key]),
      blockers,
    },
  };
}
