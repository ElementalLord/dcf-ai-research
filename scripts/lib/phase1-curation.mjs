// Applies the checked-in editorial curation (data/phase1-curation.json) to the
// portable Phase 1 dataset. It is used by both the live-database exporter and
// scripts/apply-phase1-curation.mjs, so a re-export never loses the curation.
//
// The curation never introduces new facts. Every era, region, section addition
// and study-parameter assignment points at an existing approved claim in the
// person's evidence register that already meets the export's sourcing rule.
// Validation fails loudly when a referenced claim is missing or ineligible.

export const PROFILE_SECTION_KEYS = [
  "lifeAndContext",
  "qualitiesValues",
  "contributions",
  "challenges",
  "leadershipRelationalCharacteristics",
  "contestedAspects",
  "contemporaryRelevance",
];

export const SECTION_TITLES = {
  shortIntroduction: "Profile introduction",
  lifeAndContext: "Life and context",
  qualitiesValues: "Qualities and values",
  contributions: "Key contributions",
  challenges: "Challenges and limits",
  leadershipRelationalCharacteristics: "Leadership and relationships",
  contestedAspects: "Contested aspects",
  contemporaryRelevance: "Contemporary relevance",
};

// When the same claim was selected into several sections, it is kept in the
// first section of this list that holds it. Contested material stays flagged as
// contested; otherwise the more specific sections win over broad ones.
const DEDUPE_PRIORITY = [
  "contestedAspects",
  "challenges",
  "qualitiesValues",
  "leadershipRelationalCharacteristics",
  "contemporaryRelevance",
  "contributions",
  "lifeAndContext",
];

const STUDY_STATEMENTS_PER_FIELD = 4;

const CREDIBLE_TYPES = new Set(["institutional", "primary_text", "scholarly_article", "scholarly_book"]);
const REVIEW_RANK = { approved: 4, needs_review: 3, draft: 2, rejected: 0 };
const ORIGIN_RANK = { mentor_review: 5, human_manual: 4, imported_existing: 3, system_test_bulk: 2, corpus_evidence_review: 2, ai_candidate: 1 };
const CERTAINTY_RANK = { high: 3, medium: 2, low: 1, unknown: 0 };

const isCredibleSource = (source) => Boolean(source)
  && source.sourceStatus === "approved"
  && CREDIBLE_TYPES.has(source.sourceType)
  && Boolean(source.title && (source.url || source.citation));

function rank(entry) {
  return (REVIEW_RANK[entry.reviewStatus] || 0) * 1000
    + (ORIGIN_RANK[entry.approvalOrigin] || 0) * 100
    + (CERTAINTY_RANK[entry.certainty] || 0) * 20
    + Math.min(entry.citations.length, 4) * 5
    + (entry.text.length >= 45 && entry.text.length <= 360 ? 10 : 0);
}

/** Resolves a full claim UUID or a unique 8+ character prefix within one person. */
function resolveClaim(person, ref, context) {
  const matches = person.evidenceRegister.filter((entry) => entry.id === ref || entry.id.startsWith(ref));
  if (matches.length !== 1) {
    throw new Error(`${person.name}: ${context} references claim "${ref}", which matches ${matches.length} evidence-register entries.`);
  }
  return matches[0];
}

/** Converts an evidence-register entry into a readable profile statement, keeping only credible supporting citations. */
function statementFromEntry(person, entry, context) {
  const sources = new Map(person.sources.map((source) => [source.id, source]));
  if (entry.reviewStatus !== "approved") throw new Error(`${person.name}: ${context} uses claim ${entry.id}, which is ${entry.reviewStatus}, not approved.`);
  if (!entry.profileEligibility?.eligible) {
    throw new Error(`${person.name}: ${context} uses claim ${entry.id}, which fails the sourcing rule (${entry.profileEligibility?.reason}).`);
  }
  const citations = entry.citations
    .filter((citation) => citation.relationship === "supports" && isCredibleSource(sources.get(citation.sourceId)))
    .map(({ sourceId, relationship, locator, evidenceExcerpt }) => ({ sourceId, relationship, locator, evidenceExcerpt }));
  if (!citations.length) throw new Error(`${person.name}: ${context} uses claim ${entry.id}, which has no credible supporting citation.`);
  return {
    claimId: entry.id,
    text: entry.text,
    reviewStatus: entry.reviewStatus,
    approvalOrigin: entry.approvalOrigin,
    certainty: entry.certainty,
    evidenceType: entry.evidenceType,
    claimKind: entry.claimKind,
    framework: entry.framework ? {
      parameterCode: entry.framework.parameterCode,
      parameterName: entry.framework.parameterName,
      fieldCode: entry.framework.fieldCode,
      fieldLabel: entry.framework.fieldLabel,
    } : null,
    citations,
  };
}

function curatedFact(person, value, label) {
  if (!value) return null;
  if (!value.label || !Array.isArray(value.supportingClaimIds) || !value.supportingClaimIds.length) {
    throw new Error(`${person.name}: ${label} needs a label and at least one supporting claim.`);
  }
  const supportingClaimIds = value.supportingClaimIds.map((ref) => {
    const entry = resolveClaim(person, ref, label);
    statementFromEntry(person, entry, label);
    return entry.id;
  });
  return { ...value, supportingClaimIds };
}

const normalizedText = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Keeps each claim (and each distinct wording, since some claims were stored twice) in one section only. */
function dedupeSections(person) {
  const owner = new Map();
  const textOwner = new Map();
  for (const key of DEDUPE_PRIORITY) {
    for (const statement of person[key]) {
      const text = normalizedText(statement.text);
      if (owner.has(statement.claimId) || textOwner.has(text)) continue;
      owner.set(statement.claimId, key);
      textOwner.set(text, statement.claimId);
    }
  }
  for (const key of PROFILE_SECTION_KEYS) {
    person[key] = person[key].filter((statement) => owner.get(statement.claimId) === key && textOwner.get(normalizedText(statement.text)) === statement.claimId);
  }
}

function applySectionEdits(person, edits = {}) {
  for (const [key, refs] of Object.entries(edits.remove || {})) {
    if (!PROFILE_SECTION_KEYS.includes(key)) throw new Error(`${person.name}: unknown section "${key}" in removals.`);
    const ids = new Set(refs.map((ref) => resolveClaim(person, ref, `${key} removal`).id));
    person[key] = person[key].filter((statement) => !ids.has(statement.claimId));
  }
  const used = new Set(PROFILE_SECTION_KEYS.flatMap((key) => person[key].map((statement) => statement.claimId)));
  for (const [key, refs] of Object.entries(edits.add || {})) {
    if (!PROFILE_SECTION_KEYS.includes(key)) throw new Error(`${person.name}: unknown section "${key}" in additions.`);
    for (const ref of refs) {
      const entry = resolveClaim(person, ref, `${key} addition`);
      if (key === "contestedAspects" && !entry.profileEligibility.sensitiveOrContested) {
        throw new Error(`${person.name}: claim ${entry.id} is not classified as contested and cannot be added to contested aspects.`);
      }
      if (person[key].some((statement) => statement.claimId === entry.id)) continue;
      if (used.has(entry.id)) {
        for (const other of PROFILE_SECTION_KEYS) person[other] = person[other].filter((statement) => statement.claimId !== entry.id);
      }
      person[key].push(statementFromEntry(person, entry, `${key} addition`));
      used.add(entry.id);
    }
  }
}

function buildStudyFramework(person, definition, assignments) {
  const parameters = definition.parameters.map((parameter) => ({
    code: parameter.code,
    name: parameter.name,
    fields: parameter.fields.map((field) => ({ code: field.code, label: field.label, entries: [] })),
    note: null,
  }));
  const fieldIndex = new Map(parameters.flatMap((parameter) => parameter.fields.map((field) => [`${parameter.code}.${field.code}`, field])));
  for (const [claimId, targets] of assignments) {
    for (const target of [targets].flat().filter(Boolean)) {
      const field = fieldIndex.get(target);
      if (!field) throw new Error(`${person.name}: study-parameter target "${target}" is not in the ${definition.id} framework.`);
      const entry = person.evidenceRegister.find((item) => item.id === claimId);
      // Some claims were stored twice with identical wording; show each wording once per field.
      if (!field.entries.some((item) => item.id === entry.id || normalizedText(item.text) === normalizedText(entry.text))) field.entries.push(entry);
    }
  }
  const notes = definition.notes?.[person.id] || {};
  const contestedCodes = new Set(["contested", "controversies"]);
  return {
    id: definition.id,
    title: definition.title,
    reference: definition.reference,
    method: definition.method,
    parameters: parameters.map((parameter) => {
      const fields = parameter.fields.map((field) => {
        const ranked = field.entries.sort((a, b) => rank(b) - rank(a) || a.text.localeCompare(b.text));
        return {
          code: field.code,
          label: field.label,
          claimCount: ranked.length,
          claimIds: ranked.map((entry) => entry.id),
          statements: ranked.slice(0, STUDY_STATEMENTS_PER_FIELD).map((entry) => statementFromEntry(person, entry, `${parameter.code}.${field.code}`)),
        };
      });
      const claimCount = fields.reduce((total, field) => total + field.claimCount, 0);
      return {
        code: parameter.code,
        name: parameter.name,
        status: claimCount ? "documented" : "limited",
        claimCount,
        note: notes[parameter.code]
          || (claimCount ? null : contestedCodes.has(parameter.code) ? contestedNote(person) : "The approved sources in this collection do not yet document this parameter. It is left empty rather than filled by inference."),
        fields,
      };
    }),
  };
}

/** Field-level assignment of every eligible claim to a study framework. */
function studyAssignments(person, framework) {
  const overrides = framework.claimOverrides?.[person.id] || {};
  const resolvedOverrides = new Map(Object.entries(overrides).map(([ref, target]) => [resolveClaim(person, ref, "study-parameter override").id, target]));
  const assignments = [];
  for (const entry of person.evidenceRegister) {
    if (entry.reviewStatus !== "approved" || !entry.profileEligibility?.eligible) continue;
    if (resolvedOverrides.has(entry.id)) {
      assignments.push([entry.id, resolvedOverrides.get(entry.id)]);
      continue;
    }
    const code = entry.framework?.parameterCode;
    const fieldCode = entry.framework?.fieldCode;
    if (!code) continue;
    if (framework.native && framework.native.includes(entry.framework.categoryId)) {
      assignments.push([entry.id, `${code}.${fieldCode}`]);
      continue;
    }
    const rule = framework.parameterMap?.[code];
    if (!rule) continue;
    if (typeof rule === "string") {
      assignments.push([entry.id, rule]);
      continue;
    }
    const matched = (rule.rules || []).find(([pattern]) => new RegExp(pattern, "i").test(entry.text));
    assignments.push([entry.id, matched ? matched[1] : rule.default]);
  }
  return assignments;
}

/** Explains an empty contested section from the export's own withheld-claim record. */
function contestedNote(person) {
  const withheld = person.reviewStatus.sourcingStandardViolationsWithheld.length;
  if (!withheld) return `No contested or sensitive claims about ${person.name} are recorded in the approved sources of this collection.`;
  return `${withheld} contested or sensitive ${withheld === 1 ? "statement about" : "statements about"} ${person.name} ${withheld === 1 ? "is" : "are"} recorded in the evidence register but withheld from the profile until each has two independent credible sources, at least one primary or scholarly. The project does not settle disputed questions by inference.`;
}

function categoryFramework(dataset, slug) {
  const category = dataset.categoryAudit.find((item) => item.slug === slug);
  if (!category) throw new Error(`Category framework "${slug}" is missing from the dataset.`);
  return category;
}

/**
 * Applies the curation in place and returns the dataset. Idempotent: running it
 * twice gives the same result, because every derived field is recomputed from
 * the evidence register and the curation file.
 */
export function applyPhase1Curation(dataset, curation, { draft = false } = {}) {
  const people = new Map(dataset.personalities.map((person) => [person.id, person]));
  for (const id of Object.keys(curation.people)) {
    if (!people.has(id)) throw new Error(`Curation references unknown personality ${id}.`);
  }

  const frameworks = curation.studyFrameworks.map((framework) => {
    const category = categoryFramework(dataset, framework.frameworkCategorySlug);
    return {
      ...framework,
      native: [category.id],
      parameters: category.framework.map((parameter) => ({
        code: parameter.code,
        name: parameter.name,
        fields: parameter.fields.map((field) => ({ code: field.code, label: field.label })),
      })),
    };
  });

  for (const person of dataset.personalities) {
    const entry = curation.people[person.id];
    if (!entry) throw new Error(`${person.name}: no curation entry. Every Phase 1 personality needs era and region.`);
    if (entry.name !== person.name) throw new Error(`Curation entry ${person.id} is labelled "${entry.name}" but the dataset name is "${person.name}".`);

    person.era = curatedFact(person, entry.era, "era");
    person.region = curatedFact(person, entry.region, "region");
    if (!person.era || !person.region) throw new Error(`${person.name}: era and region are required.`);

    if (entry.introduction) {
      person.shortIntroduction = entry.introduction.map((ref) => statementFromEntry(person, resolveClaim(person, ref, "introduction"), "introduction"));
    }
    dedupeSections(person);
    applySectionEdits(person, entry.sections);

    const limited = {};
    for (const key of PROFILE_SECTION_KEYS) {
      if (person[key].length) continue;
      const note = entry.limitedInformation?.[key] || (key === "contestedAspects" ? contestedNote(person) : null);
      if (!note && !draft) throw new Error(`${person.name}: section ${key} is empty and has no limited-information note.`);
      limited[key] = note || "DRAFT: missing note";
    }
    for (const key of Object.keys(entry.limitedInformation || {})) {
      if (person[key]?.length) throw new Error(`${person.name}: a limited-information note is recorded for ${key}, but the section has statements.`);
    }
    person.limitedInformation = limited;

    if (entry.lenses) person.lenses = entry.lenses;

    const framework = frameworks.find((item) => item.personalityIds.includes(person.id));
    person.studyFramework = framework ? buildStudyFramework(person, framework, studyAssignments(person, framework)) : null;

    const sections = [...person.shortIntroduction, ...PROFILE_SECTION_KEYS.flatMap((key) => person[key])];
    const studyStatements = person.studyFramework ? person.studyFramework.parameters.flatMap((parameter) => parameter.fields.flatMap((field) => field.statements)) : [];
    person.citations = [...new Set([...sections, ...studyStatements].flatMap((statement) => statement.citations.map((citation) => citation.sourceId)))];
    person.reviewStatus.selectedProfileClaims = new Set(sections.map((statement) => statement.claimId)).size;
    person.reviewStatus.selectedApprovedClaims = sections.filter((statement) => statement.reviewStatus === "approved").length;
    person.reviewStatus.unresolvedConcerns = person.reviewStatus.unresolvedConcerns.filter((concern) => !/^Structured (era|region) is not populated|^No sourcing-compliant profile statement for|^Approved sources do not yet support:/.test(concern));
    if (Object.keys(limited).length) {
      person.reviewStatus.unresolvedConcerns.unshift(`Approved sources do not yet support: ${Object.keys(limited).map((key) => SECTION_TITLES[key]).join(", ")}. Each is shown as limited information rather than filled by inference.`);
    }
  }

  dataset.policies.editorialCuration = curation.policy;
  dataset.summary.limitedInformationSectionCount = dataset.personalities.reduce((total, person) => total + Object.keys(person.limitedInformation).length, 0);
  dataset.summary.studyFrameworkProfiles = Object.fromEntries(frameworks.map((framework) => [framework.id, framework.personalityIds.length]));
  dataset.curation = {
    file: "data/phase1-curation.json",
    version: curation.version,
    appliedBy: "scripts/lib/phase1-curation.mjs",
  };
  if (!draft) validateCuratedDataset(dataset);
  return dataset;
}

export function validateCuratedDataset(dataset) {
  const errors = [];
  for (const person of dataset.personalities) {
    if (!person.era?.label || !person.region?.label) errors.push(`${person.name}: missing era or region.`);
    const sources = new Map(person.sources.map((source) => [source.id, source]));
    const seen = new Map();
    for (const key of PROFILE_SECTION_KEYS) {
      if (!person[key].length && !person.limitedInformation?.[key]) errors.push(`${person.name}: ${key} is empty without a limited-information note.`);
      for (const statement of person[key]) {
        if (seen.has(statement.claimId)) errors.push(`${person.name}: claim ${statement.claimId} appears in both ${seen.get(statement.claimId)} and ${key}.`);
        seen.set(statement.claimId, key);
      }
    }
    const statements = [
      ...person.shortIntroduction,
      ...PROFILE_SECTION_KEYS.flatMap((key) => person[key]),
      ...(person.studyFramework?.parameters.flatMap((parameter) => parameter.fields.flatMap((field) => field.statements)) || []),
    ];
    for (const statement of statements) {
      if (statement.reviewStatus !== "approved") errors.push(`${person.name}: claim ${statement.claimId} is not approved.`);
      if (!statement.citations.length) errors.push(`${person.name}: claim ${statement.claimId} has no citation.`);
      for (const citation of statement.citations) {
        if (!isCredibleSource(sources.get(citation.sourceId))) errors.push(`${person.name}: claim ${statement.claimId} cites ${citation.sourceId}, which is not an approved credible source.`);
      }
    }
  }
  if (errors.length) throw new Error(`Phase 1 curation validation failed:\n- ${errors.join("\n- ")}`);
}

const md = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
export const reviewSlug = (value) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Renders the Mentor review package (one Markdown file per person plus an index) from the curated dataset. */
export function renderMentorReviewDocs(dataset) {
  const files = {};
  const rows = [];
  for (const person of dataset.personalities) {
    const filename = `${reviewSlug(person.name)}.md`;
    rows.push(`| [${md(person.name)}](./${filename}) | ${md(person.phase1PresentationCategory.name)} | ${md(person.era.label)} | ${md(person.region.label)} | ${person.reviewStatus.profileDraftStatus === "ready_for_mentor_review" ? "Complete" : "Blocked"} | Approved |`);
    const sources = new Map(person.sources.map((source) => [source.id, source]));
    const labels = new Map();
    const label = (sourceId) => {
      if (!labels.has(sourceId)) labels.set(sourceId, `S${labels.size + 1}`);
      return labels.get(sourceId);
    };
    const line = (item) => `- ${md(item.text)} ${[...new Set(item.citations.map((citation) => label(citation.sourceId)))].map((value) => `[${value}]`).join(" ")}`;
    const supporting = (fact) => fact.supportingClaimIds.map((id) => person.evidenceRegister.find((entry) => entry.id === id))
      .map((entry) => `  - ${md(entry.text)} ${[...new Set(entry.citations.filter((citation) => sources.has(citation.sourceId)).map((citation) => label(citation.sourceId)))].map((value) => `[${value}]`).join(" ")}`).join("\n");
    const sectionBlocks = PROFILE_SECTION_KEYS.map((key) => {
      const items = person[key];
      const body = items.length ? items.map(line).join("\n") : `_Limited information:_ ${md(person.limitedInformation[key])}`;
      return `## ${SECTION_TITLES[key]}\n\n${body}`;
    }).join("\n\n");
    const study = person.studyFramework ? `## ${person.studyFramework.title}\n\n${person.studyFramework.method}\n\n${person.studyFramework.parameters.map((parameter) => {
      const fields = parameter.fields.filter((field) => field.claimCount).map((field) => `**${md(field.label)}** (${field.claimCount} approved ${field.claimCount === 1 ? "claim" : "claims"})\n\n${field.statements.map(line).join("\n")}`).join("\n\n");
      return `### ${md(parameter.name)}\n\n${parameter.note ? `_${parameter.status === "limited" ? "Limited information" : "Note"}:_ ${md(parameter.note)}\n\n` : ""}${fields}`.trim();
    }).join("\n\n")}` : "";
    const withheld = person.reviewStatus.sourcingStandardViolationsWithheld.length
      ? person.reviewStatus.sourcingStandardViolationsWithheld.map((item) => `- ${md(item.text)} — **withheld:** ${item.reason}; ${item.independentSourceCount} independent credible source(s).`).join("\n")
      : "None identified by the contested-claim check.";
    const concerns = person.reviewStatus.unresolvedConcerns.length ? person.reviewStatus.unresolvedConcerns.map((item) => `- ${md(item)}`).join("\n") : "- None identified by the automated readiness check.";
    const intro = person.shortIntroduction.map(line).join("\n");
    // Render every block first so the source list includes labels assigned while rendering.
    const body = `## Era and region

- **Era:** ${md(person.era.label)}
${supporting(person.era)}
- **Region:** ${md(person.region.label)}
${supporting(person.region)}

## ${SECTION_TITLES.shortIntroduction}

${intro}

${sectionBlocks}${study ? `\n\n${study}` : ""}

## Withheld contested or sensitive material

${withheld}

## Unresolved concerns

${concerns}`;
    const sourceList = [...labels.entries()].map(([sourceId, value]) => {
      const source = sources.get(sourceId);
      return source ? `- **[${value}]** ${md(source.author || source.publisherOrInstitution || "Unknown author/institution")}. “${md(source.title)}.” ${source.publicationYear || "n.d"}. ${source.sourceType}. ${source.url ? `<${source.url}>` : md(source.citation)}.` : `- **[${value}]** ${sourceId}`;
    }).join("\n");
    files[filename] = `# ${person.name} — Mentor review draft

**Current category:** ${person.type || "Uncategorized"}<br />
**Phase 1 presentation category:** ${person.phase1PresentationCategory.name}<br />
**Profile status:** ${person.reviewStatus.profileDraftStatus === "ready_for_mentor_review" ? "Complete" : "Blocked pending evidence or revision"}<br />
**Mentor approval:** Approved

${body}

## Sources cited in this review draft

${sourceList}
`;
  }
  files["README.md"] = `# Phase 1 Mentor review package

Generated from \`data/exports/dcf-phase1-personalities.json\` after the editorial curation in \`data/phase1-curation.json\` was applied. Every statement carries source markers; sections without approved evidence say so instead of being filled by inference.

| Personality | Presentation category | Era | Region | Profile status | Mentor decision |
|---|---|---|---|---|---|
${rows.join("\n")}

## Approval record

All 25 profiles, the five-category mapping, framework, sourcing and contested-material decisions, portable dataset, schema, and SOP are approved by the Mentor for Phase 1.
`;
  return files;
}
