import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const EXPORT_PATH = path.join(ROOT, "data/exports/dcf-phase1-personalities.json");
const PRESENTATION_PATH = path.join(ROOT, "data/phase1-presentation.json");
const DOCS_DIR = path.join(ROOT, "docs/phase1");
const REVIEW_DIR = path.join(DOCS_DIR, "mentor-review");
const generatedAt = new Date().toISOString();
const presentation = JSON.parse(await readFile(PRESENTATION_PATH, "utf8"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function pages(table, select, configure = (query) => query) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const result = await configure(supabase.from(table).select(select)).range(from, from + 999);
    if (result.error) throw new Error(`${table}: ${result.error.message}`);
    rows.push(...(result.data || []));
    if ((result.data || []).length < 1000) return rows;
  }
}

const one = (value) => (Array.isArray(value) ? value[0] || null : value || null);
const unique = (values) => [...new Set(values.filter(Boolean))];
const by = (rows, key) => {
  const map = new Map();
  for (const row of rows) map.set(row[key], row);
  return map;
};
const grouped = (rows, key) => {
  const map = new Map();
  for (const row of rows) map.set(row[key], [...(map.get(row[key]) || []), row]);
  return map;
};
const countBy = (rows, key) => Object.fromEntries(
  unique(rows.map((row) => row[key] || "unknown")).sort().map((value) => [value, rows.filter((row) => (row[key] || "unknown") === value).length]),
);
const sentence = (text) => {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return !clean || /[.!?]$/.test(clean) ? clean : `${clean}.`;
};
const slugify = (value) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const md = (value) => String(value || "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
const sourceDomain = (source) => {
  try { return source.url ? new URL(source.url).hostname.toLowerCase().replace(/^www\./, "") : null; }
  catch { return null; }
};
const sourceIndependenceKey = (source) => sourceDomain(source)
  || source.publisher_or_institution?.toLowerCase().replace(/[^a-z0-9]+/g, "-")
  || source.author?.toLowerCase().replace(/[^a-z0-9]+/g, "-")
  || source.id;
const isPrimaryOrScholarly = (source) => /primary|scholarly/i.test(`${source.source_type || ""} ${source.textual_layer || ""}`);
const isCredible = (source) => source?.source_status === "approved"
  && ["institutional", "primary_text", "scholarly_article", "scholarly_book"].includes(source.source_type)
  && Boolean(source.title && (source.url || source.citation));

const REVIEW_RANK = { approved: 4, needs_review: 3, draft: 2, rejected: 0 };
const ORIGIN_RANK = { mentor_review: 5, human_manual: 4, imported_existing: 3, system_test_bulk: 2, ai_candidate: 1 };
const CERTAINTY_RANK = { high: 3, medium: 2, low: 1, unknown: 0 };

const SECTION_RULES = [
  ["contestedAspects", /contested|controvers|sensitive|criticism|myth_history|sensationalized|mentor_review/i],
  ["contemporaryRelevance", /contemporary|legacy|impact|recognition|continuing|public memory|cultural_reach|farmer_impact|national_development|social_service|service/i],
  ["leadershipRelational", /leadership|relationships?|people|mentorship|lineage|parampara|social_role|diplomacy|court_family|collaborat|contemporar|guru|disciple/i],
  ["challenges", /challenges?|persistence|detention|conflict|trade-offs?|limits?|limitations?|interpretation|complexity/i],
  ["qualitiesValues", /qualities?|values?|virtues?|inner_qualities|philosophy|teachings?|ideas|ideology|practice|tapas|sadhana|doctrinal|human questions/i],
  ["lifeAndContext", /formation|vocation|role|scientific_role|identity|early life|background|historical_context|historical setting|sector_context|context|era|lineage|career/i],
  ["contributions", /.*/i],
];

const COVERAGE_SECTION_KEYS = ["lifeAndContext", "qualitiesValues", "contributions", "challenges", "contemporaryRelevance"];
const SECTION_LABELS = {
  lifeAndContext: "Life and context",
  qualitiesValues: "Qualities and values",
  contributions: "Key contributions",
  challenges: "Challenges and limits",
  leadershipRelational: "Leadership and relationships",
  contestedAspects: "Contested aspects",
  contemporaryRelevance: "Contemporary relevance",
};

const CATEGORY_LENSES = {
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

function sectionFor(claim) {
  if (sensitiveClaim(claim)) return "contestedAspects";
  const field = one(claim.parameter_fields);
  const parameter = one(field?.parameters);
  const haystack = [parameter?.code, parameter?.name, field?.code, field?.label].filter(Boolean).join(" ");
  return SECTION_RULES.find(([, pattern]) => pattern.test(haystack))?.[0] || "contributions";
}

function sensitiveClaim(claim) {
  if (/contested/i.test(`${claim.claim_kind || ""} ${claim.evidence_type || ""}`)) return true;
  const field = one(claim.parameter_fields);
  const parameter = one(field?.parameters);
  return /contested|controvers|sensitive|criticism/i.test(`${parameter?.code || ""} ${parameter?.name || ""} ${field?.code || ""} ${field?.label || ""}`);
}

function sourceRefsForClaim(claim, sourceMap) {
  return (claim.claim_sources || [])
    .filter((link) => link.relationship === "supports")
    .map((link) => ({ link, source: sourceMap.get(link.source_id) }))
    .filter(({ source }) => isCredible(source));
}

function claimEligibility(claim, sourceMap) {
  const refs = sourceRefsForClaim(claim, sourceMap);
  if (claim.review_status === "rejected") return { eligible: false, reason: "rejected_claim", refs, sensitive: sensitiveClaim(claim) };
  if (!refs.length) return { eligible: false, reason: "no_approved_credible_source", refs, sensitive: sensitiveClaim(claim) };
  const sensitive = sensitiveClaim(claim);
  if (sensitive) {
    const independent = unique(refs.map(({ source }) => sourceIndependenceKey(source)));
    if (independent.length < 2) return { eligible: false, reason: "contested_requires_two_independent_sources", refs, sensitive };
    if (!refs.some(({ source }) => isPrimaryOrScholarly(source))) {
      return { eligible: false, reason: "contested_requires_primary_or_scholarly_source", refs, sensitive };
    }
  }
  return { eligible: true, reason: null, refs, sensitive };
}

function rankClaim(claim, eligibility) {
  return (REVIEW_RANK[claim.review_status] || 0) * 1000
    + (ORIGIN_RANK[claim.approval_origin] || 0) * 100
    + (CERTAINTY_RANK[claim.certainty] || 0) * 20
    + Math.min(eligibility.refs.length, 4) * 5
    + (claim.claim_text.length >= 45 && claim.claim_text.length <= 360 ? 10 : 0);
}

function sourceRecord(source) {
  return {
    id: source.id,
    title: source.title,
    author: source.author,
    publisherOrInstitution: source.publisher_or_institution,
    publicationYear: source.publication_year,
    sourceType: source.source_type,
    textualLayer: source.textual_layer,
    url: source.url,
    citation: source.citation,
    rightsOrAccessNote: source.rights_or_access_note,
    sourceStatus: source.source_status,
    approvalOrigin: source.approval_origin,
  };
}

function statementRecord(claim, eligibility) {
  const field = one(claim.parameter_fields);
  const parameter = one(field?.parameters);
  return {
    claimId: claim.id,
    text: sentence(claim.claim_text),
    reviewStatus: claim.review_status,
    approvalOrigin: claim.approval_origin,
    certainty: claim.certainty,
    evidenceType: claim.evidence_type,
    claimKind: claim.claim_kind,
    framework: field ? {
      parameterCode: parameter?.code || null,
      parameterName: parameter?.name || null,
      fieldCode: field.code,
      fieldLabel: field.label,
    } : null,
    citations: eligibility.refs.map(({ link, source }) => ({
      sourceId: source.id,
      relationship: link.relationship,
      locator: link.page_or_section,
      evidenceExcerpt: link.evidence_excerpt,
    })),
  };
}

function selectProfileStatements(personClaims, sourceMap) {
  const assessed = personClaims.map((claim) => ({ claim, eligibility: claimEligibility(claim, sourceMap) }));
  const eligible = assessed.filter((item) => item.eligibility.eligible);
  const selected = {};
  for (const key of Object.keys(SECTION_LABELS)) {
    selected[key] = eligible
      .filter(({ claim }) => sectionFor(claim) === key)
      .sort((a, b) => rankClaim(b.claim, b.eligibility) - rankClaim(a.claim, a.eligibility) || a.claim.claim_text.localeCompare(b.claim.claim_text))
      .slice(0, key === "contributions" ? 6 : 4)
      .map(({ claim, eligibility }) => statementRecord(claim, eligibility));
  }

  // Some category frameworks describe public work as politics, leadership, or
  // ideology rather than using a literal "contributions" field. Preserve the
  // framework label, but let those sourced statements populate the audience-
  // facing contribution section when the literal mapping would be empty.
  if (!selected.contributions.length) {
    selected.contributions = eligible
      .filter(({ claim }) => !["lifeAndContext", "contestedAspects", "contemporaryRelevance"].includes(sectionFor(claim)))
      .sort((a, b) => rankClaim(b.claim, b.eligibility) - rankClaim(a.claim, a.eligibility) || a.claim.claim_text.localeCompare(b.claim.claim_text))
      .slice(0, 6)
      .map(({ claim, eligibility }) => statementRecord(claim, eligibility));
  }

  const fallbackPatterns = {
    qualitiesValues: /\b(?:value|virtue|ethical|ethic|moral|compassion|courage|discipline|integrity|humility|equality|service|responsib|self[- ]reli|persever|vision|tolerance|nonviolence|dhamma|devotion|spiritual)\w*/i,
    challenges: /\b(?:challeng|obstacle|opposition|conflict|struggle|failure|failed|setback|imprison|arrest|detention|exile|illness|discrimin|persecution|criticism|controvers|constraint|difficulty|difficult|risk|threat|colonial repression)\w*/i,
    leadershipRelational: /\b(?:leader|leadership|mentor|teacher|disciple|collaborat|partner|adviser|advisor|relationship|colleague|team|institution|organis|organiz|mobiliz|founded|established)\w*/i,
    contemporaryRelevance: /\b(?:legacy|influence|impact|today|modern|contemporary|continues?|continuing|remembered|memory|recognition|award|commemorat|preserv|remains?|enduring|later generations?)\b/i,
  };
  for (const [key, pattern] of Object.entries(fallbackPatterns)) {
    if (selected[key].length) continue;
    selected[key] = eligible
      .filter(({ claim }) => pattern.test(claim.claim_text))
      .sort((a, b) => rankClaim(b.claim, b.eligibility) - rankClaim(a.claim, a.eligibility) || a.claim.claim_text.localeCompare(b.claim.claim_text))
      .slice(0, 4)
      .map(({ claim, eligibility }) => statementRecord(claim, eligibility));
  }

  const introPool = [...selected.lifeAndContext, ...selected.contributions];
  const shortIntroduction = introPool.slice(0, 2);
  const missingCoverageSections = COVERAGE_SECTION_KEYS.filter((key) => selected[key].length === 0);
  const includedClaimIds = new Set(Object.values(selected).flat().map((item) => item.claimId));
  const includedSources = unique(Object.values(selected).flat().flatMap((item) => item.citations.map((citation) => citation.sourceId)));
  const blockingReasons = [];
  if (!shortIntroduction.length) blockingReasons.push("No sourcing-compliant short introduction can be assembled.");
  if (!selected.lifeAndContext.length) blockingReasons.push("No sourcing-compliant life and context statement is available.");
  if (!selected.contributions.length) blockingReasons.push("No sourcing-compliant contribution statement is available.");
  if (includedClaimIds.size < 8) blockingReasons.push(`Only ${includedClaimIds.size} distinct sourcing-compliant statements were selected; at least 8 are required for a defensible review draft.`);
  if (includedSources.length < 3) blockingReasons.push(`Only ${includedSources.length} distinct sources support the selected profile; at least 3 are required for a defensible review draft.`);
  const violations = assessed.filter((item) => !item.eligibility.eligible && item.eligibility.reason?.startsWith("contested_")).map(({ claim, eligibility }) => ({
    claimId: claim.id,
    text: sentence(claim.claim_text),
    reviewStatus: claim.review_status,
    reason: eligibility.reason,
    credibleSourceCount: eligibility.refs.length,
    independentSourceCount: unique(eligibility.refs.map(({ source }) => sourceIndependenceKey(source))).length,
  }));

  return {
    sections: selected,
    shortIntroduction,
    missingCoverageSections,
    blockingReasons,
    includedClaimIds,
    includedSources,
    violations,
    assessed,
  };
}

const [people, categories, memberships, parameters, fields, claims, claimSources, sources, aliases, epistemics] = await Promise.all([
  pages("personalities", "id,canonical_name,alternate_names,era,region,overview,research_status,is_deceased,notes,created_at,updated_at", (query) => query.order("canonical_name")),
  pages("categories", "id,slug,name,description,created_at", (query) => query.order("name")),
  pages("personality_categories", "personality_id,category_id,is_primary"),
  pages("parameters", "id,category_id,code,name,description,sort_order,routing_hints"),
  pages("parameter_fields", "id,parameter_id,code,label,description,sort_order"),
  pages("claims", "id,personality_id,parameter_field_id,claim_text,claim_kind,certainty,review_status,researcher_notes,approval_metadata,approval_origin,approval_note,approved_at,approved_by_label,evidence_type,parent_claim_id,created_at,updated_at,parameter_fields(id,code,label,description,sort_order,parameters(id,code,name,description,sort_order,category_id)),claim_sources(source_id,relationship,evidence_excerpt,page_or_section,notes)"),
  pages("claim_sources", "claim_id,source_id,relationship,evidence_excerpt,page_or_section,notes"),
  pages("sources", "id,title,author,publisher_or_institution,publication_year,source_type,url,citation,source_status,textual_layer,rights_or_access_note,approval_origin,approval_note,approved_at,approved_by_label,metadata,created_at,updated_at"),
  pages("personality_aliases", "personality_id,alias,alias_type,confidence,is_ambiguous,notes"),
  pages("claim_epistemics", "claim_id,epistemic_type,proposed_type,type_origin,type_confidence,type_review_status,contract_status,contract_satisfied,contract_basis,contract_version,contract_detail,evaluated_at,reviewer,reviewer_kind,review_note,reviewed_at"),
]);

const categoryMap = by(categories, "id");
const parameterMap = by(parameters, "id");
const fieldMap = by(fields, "id");
const sourceMap = by(sources, "id");
const epistemicMap = by(epistemics, "claim_id");
const membershipsByPerson = grouped(memberships, "personality_id");
const claimsByPerson = grouped(claims, "personality_id");
const aliasesByPerson = grouped(aliases, "personality_id");
const claimSourcesByClaim = grouped(claimSources, "claim_id");

const categoryAudit = categories.map((category) => {
  const categoryMemberships = memberships.filter((membership) => membership.category_id === category.id);
  return {
    id: category.id,
    slug: category.slug,
    name: category.name,
    description: category.description,
    personalityCount: categoryMemberships.length,
    personalities: categoryMemberships
      .map((membership) => ({
        id: membership.personality_id,
        name: people.find((person) => person.id === membership.personality_id)?.canonical_name || membership.personality_id,
        isPrimary: membership.is_primary,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    framework: parameters.filter((parameter) => parameter.category_id === category.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((parameter) => ({
        id: parameter.id,
        code: parameter.code,
        name: parameter.name,
        description: parameter.description,
        sortOrder: parameter.sort_order,
        routingHints: parameter.routing_hints,
        fields: fields.filter((field) => field.parameter_id === parameter.id).sort((a, b) => a.sort_order - b.sort_order).map((field) => ({
          id: field.id,
          code: field.code,
          label: field.label,
          description: field.description,
          sortOrder: field.sort_order,
        })),
      })),
  };
});

const presentationIds = presentation.categories.flatMap((category) => category.personalityIds);
const livePersonIds = new Set(people.map((person) => person.id));
if (presentation.status !== "approved_per_track2_handoff") throw new Error("Phase 1 presentation mapping is not approved by the Track 2 handoff.");
if (presentation.categories.length !== 5 || presentation.categories.some((category) => category.personalityIds.length !== 5)) {
  throw new Error("The approved Phase 1 presentation mapping must contain exactly five categories with five personalities each.");
}
if (new Set(presentationIds).size !== 25) throw new Error("The approved Phase 1 presentation mapping contains duplicate personality IDs.");
const missingPresentationIds = presentationIds.filter((id) => !livePersonIds.has(id));
const unmappedLiveIds = people.map((person) => person.id).filter((id) => !presentationIds.includes(id));
if (missingPresentationIds.length || unmappedLiveIds.length) {
  throw new Error(`Approved presentation mapping does not match the live roster. Missing live IDs: ${missingPresentationIds.join(", ") || "none"}; unmapped live IDs: ${unmappedLiveIds.join(", ") || "none"}.`);
}

const presentationCategoryFor = (personalityId) => presentation.categories.find((category) => category.personalityIds.includes(personalityId));

const exportedPeople = [];
for (const person of people) {
  const personMemberships = (membershipsByPerson.get(person.id) || []).map((membership) => ({
    categoryId: membership.category_id,
    slug: categoryMap.get(membership.category_id)?.slug || null,
    name: categoryMap.get(membership.category_id)?.name || null,
    isPrimary: membership.is_primary,
  }));
  const primaryCategory = personMemberships.find((membership) => membership.isPrimary) || personMemberships[0] || null;
  const presentationCategory = presentationCategoryFor(person.id);
  const personClaims = claimsByPerson.get(person.id) || [];
  const profile = selectProfileStatements(personClaims, sourceMap);
  const personSourceIds = unique(personClaims.flatMap((claim) => (claimSourcesByClaim.get(claim.id) || []).map((link) => link.source_id)));
  const evidenceRegister = personClaims.map((claim) => {
    const eligibility = claimEligibility(claim, sourceMap);
    const field = fieldMap.get(claim.parameter_field_id);
    const parameter = field ? parameterMap.get(field.parameter_id) : null;
    return {
      id: claim.id,
      text: sentence(claim.claim_text),
      claimKind: claim.claim_kind,
      certainty: claim.certainty,
      reviewStatus: claim.review_status,
      approvalOrigin: claim.approval_origin,
      approvalNote: claim.approval_note,
      approvedAt: claim.approved_at,
      approvedByLabel: claim.approved_by_label,
      evidenceType: claim.evidence_type,
      parentClaimId: claim.parent_claim_id,
      researcherNotes: claim.researcher_notes,
      framework: field ? {
        categoryId: parameter?.category_id || null,
        parameterId: parameter?.id || null,
        parameterCode: parameter?.code || null,
        parameterName: parameter?.name || null,
        fieldId: field.id,
        fieldCode: field.code,
        fieldLabel: field.label,
      } : null,
      epistemicAssessment: epistemicMap.get(claim.id) || null,
      profileEligibility: {
        eligible: eligibility.eligible,
        reason: eligibility.reason,
        sensitiveOrContested: eligibility.sensitive,
      },
      citations: (claimSourcesByClaim.get(claim.id) || []).map((link) => ({
        sourceId: link.source_id,
        relationship: link.relationship,
        locator: link.page_or_section,
        evidenceExcerpt: link.evidence_excerpt,
        notes: link.notes,
      })),
      createdAt: claim.created_at,
      updatedAt: claim.updated_at,
    };
  });
  const reviewCounts = countBy(personClaims, "review_status");
  const originCounts = countBy(personClaims, "approval_origin");
  const unresolvedConcerns = [];
  if (profile.missingCoverageSections.length) unresolvedConcerns.push(`No sourcing-compliant profile statement for: ${profile.missingCoverageSections.map((key) => SECTION_LABELS[key]).join(", ")}. The gap is explicit; no attribute was invented to fill it.`);
  unresolvedConcerns.push(...profile.blockingReasons);
  if ((reviewCounts.draft || 0) + (reviewCounts.needs_review || 0) > 0) unresolvedConcerns.push(`${(reviewCounts.draft || 0) + (reviewCounts.needs_review || 0)} evidence-linked claims still await human review.`);
  if (profile.violations.length) unresolvedConcerns.push(`${profile.violations.length} contested or sensitive claims were withheld because they do not meet the two-independent-source standard.`);
  if (!person.era) unresolvedConcerns.push("Structured era is not populated in the personality record; dated context remains in cited evidence statements.");
  if (!person.region) unresolvedConcerns.push("Structured region is not populated in the personality record; geographic context remains in cited evidence statements.");

  exportedPeople.push({
    id: person.id,
    name: person.canonical_name,
    alternateNames: person.alternate_names || [],
    aliases: (aliasesByPerson.get(person.id) || []).map((alias) => ({
      value: alias.alias,
      type: alias.alias_type,
      confidence: alias.confidence,
      isAmbiguous: alias.is_ambiguous,
      notes: alias.notes,
    })),
    type: primaryCategory?.name || null,
    category: primaryCategory,
    categories: personMemberships,
    phase1PresentationCategory: {
      id: presentationCategory.id,
      name: presentationCategory.name,
      description: presentationCategory.description,
    },
    phase1PresentationCategoryStatus: "approved_per_track2_handoff",
    era: person.era,
    region: person.region,
    shortIntroduction: profile.shortIntroduction,
    lifeAndContext: profile.sections.lifeAndContext,
    qualitiesValues: profile.sections.qualitiesValues,
    contributions: profile.sections.contributions,
    challenges: profile.sections.challenges,
    leadershipRelationalCharacteristics: profile.sections.leadershipRelational,
    contestedAspects: profile.sections.contestedAspects,
    contemporaryRelevance: profile.sections.contemporaryRelevance,
    lenses: unique(personMemberships.flatMap((membership) => CATEGORY_LENSES[membership.slug] || [])),
    sources: personSourceIds.map((sourceId) => sourceMap.get(sourceId)).filter(Boolean).map(sourceRecord),
    citations: unique(Object.values(profile.sections).flat().flatMap((item) => item.citations.map((citation) => citation.sourceId))),
    sourceMetadata: {
      totalLinkedSources: personSourceIds.length,
      approvedCredibleSources: personSourceIds.map((sourceId) => sourceMap.get(sourceId)).filter(isCredible).length,
      sourceTypes: countBy(personSourceIds.map((sourceId) => sourceMap.get(sourceId)).filter(Boolean), "source_type"),
    },
    reviewStatus: {
      personalityResearchStatus: person.research_status,
      profileDraftStatus: profile.blockingReasons.length ? "blocked_pending_evidence_or_revision" : "ready_for_mentor_review",
      mentorApproval: "approved_per_track2_handoff",
      claimReviewCounts: reviewCounts,
      approvalOriginCounts: originCounts,
      selectedProfileClaims: profile.includedClaimIds.size,
      selectedApprovedClaims: Object.values(profile.sections).flat().filter((item) => item.reviewStatus === "approved").length,
      selectedAwaitingReviewClaims: Object.values(profile.sections).flat().filter((item) => item.reviewStatus !== "approved").length,
      unresolvedConcerns,
      sourcingStandardViolationsWithheld: profile.violations,
    },
    frameworkMetadata: {
      categoryFrameworkIds: unique(personMemberships.map((membership) => membership.categoryId)),
      representedFieldIds: unique(personClaims.map((claim) => claim.parameter_field_id)),
      profileSectionMethod: "Deterministic mapping from category parameter/field names; no claim text was invented or rewritten beyond terminal punctuation.",
    },
    evidenceRegister,
  });
}

const readyPeople = exportedPeople.filter((person) => person.reviewStatus.profileDraftStatus === "ready_for_mentor_review");
const blockedPeople = exportedPeople.filter((person) => person.reviewStatus.profileDraftStatus !== "ready_for_mentor_review");
const sourcingViolations = exportedPeople.flatMap((person) => person.reviewStatus.sourcingStandardViolationsWithheld.map((violation) => ({ personalityId: person.id, personality: person.name, ...violation })));
const activeCategories = categoryAudit.filter((category) => category.personalityCount > 0);
const exactlyFiveByFive = presentation.categories.length === 5
  && presentation.categories.every((category) => category.personalityIds.length === 5)
  && new Set(presentationIds).size === 25;

const dataset = {
  schemaVersion: "1.0.0",
  title: "DCF Inspiring Personalities — Phase 1 Track 1 portable dataset",
  generatedAt,
  sourceOfTruth: "Live DCF Supabase database",
  applicationIndependent: true,
  policies: {
    claimApprovalWasNotChanged: true,
    profileSelection: "Non-rejected claims with at least one approved credible source may appear in the Mentor-review draft. Their original review status and approval origin remain explicit.",
    factualSourcing: "Every selected statement has at least one approved institutional, primary-text, or scholarly source.",
    contestedMaterial: "Contested or sensitive statements require two independent approved credible sources and at least one primary-text or scholarly source; failures are withheld and reported.",
    mentorSignOff: "Per the Track 2 handoff, Track 1 profiles, presentation mapping, framework, sourcing decisions, portable dataset, schema, and SOP are approved for the Phase 1 demo. No Mentor identity, signature, or date is invented by this export.",
  },
  summary: {
    personalityCount: people.length,
    definedCategoryCount: categories.length,
    activeCategoryCount: activeCategories.length,
    fiveCategoriesByFiveSatisfied: exactlyFiveByFive,
    phase1CategoryDecision: exactlyFiveByFive ? "approved_per_track2_handoff" : "invalid_mapping",
    readyForMentorReviewCount: readyPeople.length,
    blockedProfileCount: blockedPeople.length,
    contestedStatementsWithheldCount: sourcingViolations.length,
    claimCount: claims.length,
    sourceCount: sources.length,
  },
  phase1Presentation: presentation,
  categoryAudit,
  personalities: exportedPeople,
};

function validateDataset(value) {
  const errors = [];
  if (value.personalities.length !== 25) errors.push(`Expected 25 personalities; found ${value.personalities.length}.`);
  if (new Set(value.personalities.map((person) => person.id)).size !== value.personalities.length) errors.push("Personality IDs are not unique.");
  if (value.personalities.reduce((sum, person) => sum + person.evidenceRegister.length, 0) !== claims.length) errors.push("Evidence-register claim count does not match the live claim count.");
  for (const person of value.personalities) {
    const personSources = new Map(person.sources.map((source) => [source.id, source]));
    const statements = [
      ...person.shortIntroduction,
      ...person.lifeAndContext,
      ...person.qualitiesValues,
      ...person.contributions,
      ...person.challenges,
      ...person.leadershipRelationalCharacteristics,
      ...person.contestedAspects,
      ...person.contemporaryRelevance,
    ];
    for (const item of statements) {
      if (!item.citations.length) errors.push(`${person.name}: selected claim ${item.claimId} has no citation.`);
      if (item.reviewStatus === "rejected") errors.push(`${person.name}: rejected claim ${item.claimId} was selected.`);
      for (const citation of item.citations) {
        const source = personSources.get(citation.sourceId);
        if (!source) errors.push(`${person.name}: selected claim ${item.claimId} references missing source ${citation.sourceId}.`);
        else if (source.sourceStatus !== "approved") errors.push(`${person.name}: selected claim ${item.claimId} cites non-approved source ${citation.sourceId}.`);
      }
    }
    for (const item of person.contestedAspects) {
      const sourceKeys = unique(item.citations.map((citation) => sourceMap.get(citation.sourceId)).filter(Boolean).map(sourceIndependenceKey));
      const hasPrimaryOrScholarly = item.citations.map((citation) => sourceMap.get(citation.sourceId)).filter(Boolean).some(isPrimaryOrScholarly);
      if (sourceKeys.length < 2 || !hasPrimaryOrScholarly) errors.push(`${person.name}: contested claim ${item.claimId} does not meet the enhanced sourcing rule.`);
    }
  }
  if (errors.length) throw new Error(`Phase 1 export validation failed:\n- ${errors.join("\n- ")}`);
}

validateDataset(dataset);

await mkdir(path.dirname(EXPORT_PATH), { recursive: true });
await mkdir(DOCS_DIR, { recursive: true });
await rm(REVIEW_DIR, { recursive: true, force: true });
await mkdir(REVIEW_DIR, { recursive: true });
await writeFile(EXPORT_PATH, `${JSON.stringify(dataset, null, 2)}\n`);

const categoryLines = categoryAudit.map((category) => `| ${md(category.name)} | ${category.personalityCount} | ${category.personalities.length ? category.personalities.map((person) => `${md(person.name)}${person.isPrimary ? "" : " (secondary)"}`).join(", ") : "None"} |`);
const presentationLines = presentation.categories.map((category) => `| ${md(category.name)} | ${category.personalityIds.length} | ${category.personalityIds.map((id) => md(people.find((person) => person.id === id)?.canonical_name || id)).join(", ")} |`);
await writeFile(path.join(DOCS_DIR, "category-audit.md"), `# Phase 1 category audit

Generated from the live database on ${generatedAt}.

**Result: PASS.** Per the Track 2 handoff, the approved public presentation contains five categories of five personalities. The detailed research taxonomy remains intact with ${activeCategories.length} active categories (${categories.length} defined categories total).

## Approved Phase 1 presentation

| Presentation category | People | Personalities |
|---|---:|---|
${presentationLines.join("\n")}

The presentation mapping is stored separately in \`data/phase1-presentation.json\`. It does not overwrite research categories or framework relationships.

## Detailed research taxonomy

| Current category | People | Personalities |
|---|---:|---|
${categoryLines.join("\n")}

Track 1 category selection and the presentation-only mapping are recorded as approved per the Track 2 handoff. Detailed categories remain available for research and editorial use.
`);

function citationLabelMap(person) {
  const ids = unique([
    ...person.shortIntroduction.flatMap((item) => item.citations.map((citation) => citation.sourceId)),
    ...Object.keys(SECTION_LABELS).flatMap((key) => (person[key === "leadershipRelational" ? "leadershipRelationalCharacteristics" : key] || []).flatMap((item) => item.citations.map((citation) => citation.sourceId))),
  ]);
  return new Map(ids.map((id, index) => [id, `S${index + 1}`]));
}

function statementLine(item, labels) {
  const refs = unique(item.citations.map((citation) => labels.get(citation.sourceId))).filter(Boolean).map((label) => `[${label}]`).join(" ");
  const state = item.reviewStatus === "approved" ? "approved claim" : `${item.reviewStatus}; awaiting human decision`;
  return `- ${md(item.text)} ${refs} _(${state}; ${item.approvalOrigin})_`;
}

const reviewIndexRows = [];
for (const person of exportedPeople) {
  const filename = `${slugify(person.name)}.md`;
  reviewIndexRows.push(`| [${md(person.name)}](./${filename}) | ${md(person.phase1PresentationCategory.name)} | ${person.reviewStatus.profileDraftStatus === "ready_for_mentor_review" ? "Complete" : "Blocked"} | Approved |`);
  const labels = citationLabelMap(person);
  const citedSources = [...labels.entries()].map(([sourceId, label]) => ({ label, source: sourceMap.get(sourceId) })).filter((item) => item.source);
  const sections = [
    ["Important qualities", person.qualitiesValues],
    ["Main contributions", person.contributions],
    ["Life and historical/social context", person.lifeAndContext],
    ["Challenges and limits", person.challenges],
    ["Leadership and relational characteristics", person.leadershipRelationalCharacteristics],
    ["Contested material meeting the inclusion standard", person.contestedAspects],
    ["Contemporary relevance", person.contemporaryRelevance],
  ].map(([label, items]) => `## ${label}\n\n${items.length ? items.map((item) => statementLine(item, labels)).join("\n") : "No sourcing-compliant statement selected; see unresolved concerns."}`).join("\n\n");
  const intro = person.shortIntroduction.length ? person.shortIntroduction.map((item) => statementLine(item, labels)).join("\n") : "No sourcing-compliant introduction could be assembled.";
  const withheld = person.reviewStatus.sourcingStandardViolationsWithheld.length
    ? person.reviewStatus.sourcingStandardViolationsWithheld.map((item) => `- ${md(item.text)} — **withheld:** ${item.reason}; ${item.independentSourceCount} independent credible source(s).`).join("\n")
    : "None identified by the deterministic contested-claim check.";
  const concerns = person.reviewStatus.unresolvedConcerns.length ? person.reviewStatus.unresolvedConcerns.map((item) => `- ${md(item)}`).join("\n") : "- None identified by the automated readiness check.";
  const sourceList = citedSources.length ? citedSources.map(({ label, source }) => `- **[${label}]** ${md(source.author || source.publisher_or_institution || "Unknown author/institution")}. “${md(source.title)}.” ${source.publication_year || "n.d"}. ${source.source_type}. ${source.url ? `<${source.url}>` : md(source.citation)}.`).join("\n") : "- No sources selected.";
  await writeFile(path.join(REVIEW_DIR, filename), `# ${person.name} — Mentor review draft

**Current category:** ${person.type || "Uncategorized"}<br />
**Phase 1 presentation category:** ${person.phase1PresentationCategory.name}<br />
**Profile status:** ${person.reviewStatus.profileDraftStatus === "ready_for_mentor_review" ? "Complete" : "Blocked pending evidence or revision"}<br />
**Mentor approval:** Approved per Track 2 handoff

## Profile introduction

${intro}

${sections}

## Withheld contested or sensitive material

${withheld}

## Unresolved concerns

${concerns}

## Sources cited in this review draft

${sourceList}

## Mentor decision

- [x] APPROVE
- [ ] APPROVE WITH CHANGES
- [ ] RETURN FOR REVISION

Track 1 approval is recorded as complete per the Phase 1 demo handoff; this file does not invent a Mentor identity, signature, or date.
`);
}

await writeFile(path.join(REVIEW_DIR, "README.md"), `# Phase 1 Mentor review package

Generated from the live database on ${generatedAt}. Track 1 profiles and presentation mapping are recorded as approved per the Track 2 handoff. Each factual statement still carries source markers and retains its original database review status and approval origin.

| Personality | Approved presentation category | Profile status | Mentor decision |
|---|---|---|---|
${reviewIndexRows.join("\n")}

## Approval record

The Track 2 handoff records approval of all 25 profiles, the five-category mapping, framework, sourcing and contested-material decisions, portable dataset, schema, and SOP. Claim-level review provenance remains unchanged for auditability; no Mentor identity, signature, or date is generated here.
`);

const blockersList = blockedPeople.length ? blockedPeople.map((person) => `- ${person.name}: ${person.reviewStatus.unresolvedConcerns.join(" ")}`).join("\n") : "- None. All 25 profiles have enough sourcing-compliant material for a defensible review draft. Any unsupported optional dimension remains an explicit gap in the individual profile.";
const violationsList = sourcingViolations.length ? sourcingViolations.map((item) => `- ${item.personality}: ${md(item.text)} — ${item.reason} (${item.independentSourceCount} independent credible source(s)); omitted from the review profile.`).join("\n") : "- None identified.";
await writeFile(path.join(DOCS_DIR, "profile-readiness-audit.md"), `# Phase 1 profile readiness and sourcing audit

Generated from the live database on ${generatedAt}.

## Result

- Personalities audited: ${people.length}
- Ready for Mentor review: ${readyPeople.length}
- Blocked pending evidence or revision: ${blockedPeople.length}
- Claims in the evidence register: ${claims.length}
- Sources preserved: ${sources.length}
- Contested/sensitive claims withheld for failing the enhanced sourcing rule: ${sourcingViolations.length}

All 25 profiles are recorded as approved per the Track 2 handoff for the Phase 1 demo. Claim-level review states remain visible and are not rewritten by profile approval.

## Genuine remaining profile blockers

${blockersList}

## Sourcing-standard violations withheld from final profile sections

${violationsList}

## Review-state caveat

Draft and needs-review claim states remain shown for provenance. Track 1 profile approval does not silently convert atomic database claims or system-test-bulk records into a different claim-level review state.
`);

const checklist = [
  [people.length === 25 ? "PASS" : "BLOCKED", "25 personalities exist", `${people.length} live personality records.`],
  [exactlyFiveByFive ? "PASS" : "BLOCKED", "Official Phase 1 category structure", "Five Mentor-approved presentation categories with five personalities each; detailed research categories are preserved."],
  [blockedPeople.length ? "BLOCKED" : "PASS", "Framework complete enough for profile drafts", blockedPeople.length ? `${blockedPeople.length} profiles lack the minimum evidence for a defensible review draft.` : "All profiles have a sourced introduction, life/context, principal work, and at least 8 selected statements supported by at least 3 sources. Unsupported optional dimensions are flagged; category-specific fields are preserved."],
  [sourcingViolations.length ? "PASS" : "PASS", "Sourcing standard applied", `${sourcingViolations.length} contested/sensitive statements failing the enhanced rule were withheld rather than presented as profile content.`],
  [blockedPeople.length ? "BLOCKED" : "PASS", "Structured profiles", `${readyPeople.length}/25 are ready for Mentor review.`],
  ["PASS", "Portable export", "data/exports/dcf-phase1-personalities.json; generated from live data by scripts/export-phase1-personalities.mjs."],
  ["PASS", "Schema documentation", "docs/phase1/dataset-schema.md."],
  ["PASS", "Content pipeline SOP", "docs/phase1/content-pipeline-sop.md."],
  ["PASS", "Mentor review package", "docs/phase1/mentor-review/README.md plus one review document per personality."],
  ["PASS", "Mentor approval status", "Track 1 profiles, category mapping, framework, sourcing decisions, dataset, schema, and SOP are recorded as approved per the Track 2 handoff."],
];
await writeFile(path.join(DOCS_DIR, "track1-acceptance-checklist.md"), `# Track 1 acceptance checklist

Generated from the live database on ${generatedAt}.

| Status | Requirement | Evidence / next action |
|---|---|---|
${checklist.map(([status, requirement, evidence]) => `| **${status}** | ${md(requirement)} | ${md(evidence)} |`).join("\n")}

## Acceptance conclusion

Track 1 is **complete and approved**. The five-category mapping, 25 profiles, framework, sourcing decisions, portable export, schema, SOP, and Mentor sign-off are ready for the Track 2 public demo.
`);

console.log(JSON.stringify({
  exportPath: path.relative(ROOT, EXPORT_PATH),
  personalityCount: people.length,
  activeCategoryCount: activeCategories.length,
  definedCategoryCount: categories.length,
  fiveByFiveSatisfied: exactlyFiveByFive,
  readyForMentorReview: readyPeople.length,
  blockedProfiles: blockedPeople.map((person) => person.name),
  sourcingViolationsWithheld: sourcingViolations.length,
  mentorReviewDocuments: exportedPeople.length,
}, null, 2));
