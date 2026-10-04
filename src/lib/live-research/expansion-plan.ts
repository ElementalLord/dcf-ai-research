import { normalizeSearchQuery } from "./web-search-provider";

export type Gap = { name: string; code: string; sourceChunks: number; uniqueEvidenceSources: number; independentWorks?: number; primaryWorks?: number; scholarlyWorks?: number; claimsWithExactPassages: number; approvedClaims: number; fields: Array<{ id: string; label: string }> };
export type SourceTarget = "primary_edition" | "scholarly_reference" | "peer_reviewed_scholarship" | "institutional_repository";
export type QueryStrategy = "topic" | "work" | "journal" | "repository" | "scholar" | "textual_reference" | "textual_development" | "variant";
export type PlannedQuery = { query: string; parameterCode: string | null; fieldIds: string[]; targetSourceType: SourceTarget; strategy: QueryStrategy; weaknessReason: string; expectedKnowledgeGain: number };
export type StrategyPerformance = Partial<Record<QueryStrategy, { attempts: number; credible: number; newWorks: number; exactLinks: number }>>;

export function rankCoverageGaps(gaps: Gap[]): Gap[] {
  return [...gaps].sort((a, b) => {
    const score = (gap: Gap) => (gap.sourceChunks === 0 ? 12 : 0) + ((gap.independentWorks ?? gap.uniqueEvidenceSources) < 2 ? 6 : 0)
      + (gap.primaryWorks === 0 ? 3 : 0) + (gap.scholarlyWorks === 0 ? 3 : 0)
      + (gap.approvedClaims ? (1 - gap.claimsWithExactPassages / gap.approvedClaims) * 10 : 4)
      + (gap.sourceChunks < 3 ? 1 : 0)
      + (/text|histor|contested|role|tapas|philosoph/i.test(`${gap.code} ${gap.name}`) ? 5 : 0);
    return score(b) - score(a) || a.sourceChunks - b.sourceChunks || a.name.localeCompare(b.name);
  });
}

export function targetForGap(gap: Gap): { type: SourceTarget; reason: string } {
  const subject = `${gap.code} ${gap.name}`;
  if (/histor|contest|uncertain|philosoph|contempor/i.test(subject) && !gap.scholarlyWorks)
    return { type: "peer_reviewed_scholarship", reason: "Scholarly interpretation or independent analysis is missing" };
  if (!gap.primaryWorks && /text|contribut|lineage|tapas|narrative|relationship/i.test(subject))
    return { type: "primary_edition", reason: "Exact primary passages are missing" };
  if ((gap.independentWorks ?? gap.uniqueEvidenceSources) < 2)
    return { type: "institutional_repository", reason: "Independent works and source families are scarce" };
  if (!gap.scholarlyWorks) return { type: "scholarly_reference", reason: "Scholarly contextualization is missing" };
  return { type: "primary_edition", reason: "Approved claims need exact passage support" };
}

export function strategyPenalty(strategy: QueryStrategy, performance: StrategyPerformance): number {
  const record = performance[strategy];
  if (!record || record.attempts < 2) return 0;
  return record.credible + record.newWorks + record.exactLinks === 0 ? Math.min(8, record.attempts * 2) : 0;
}

export function strategiesExhausted(performance: StrategyPerformance): boolean {
  return (["work", "journal", "repository", "textual_reference", "textual_development", "variant"] as QueryStrategy[])
    .every((strategy) => strategyPenalty(strategy, performance) >= 4);
}

export function buildExpansionQueries(input: { name: string; aliases: string[]; gaps: Gap[]; sourceTitles: string[]; relationships: string[]; events: string[]; domains: string[]; candidateWorks?: Array<{ title: string; author?: string | null; year?: string | null; doi?: string | null }>; performance?: StrategyPerformance }, max = 25): PlannedQuery[] {
  const out: PlannedQuery[] = [];
  const seen = new Set<string>();
  const ranked = rankCoverageGaps(input.gaps);
  const aliases = [...new Set([input.name, ...input.aliases])].filter(Boolean);
  const concise = (value: string) => value.replace(/\([^)]*\)/g, " ").replace(/\s*\/\s*/g, " ").split(/[,;]/)[0].trim().split(/\s+/).slice(0, 6).join(" ");
  const add = (query: string, gap: Gap | null, strategy: QueryStrategy, target?: SourceTarget) => {
    const normalized = normalizeSearchQuery(query);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    const need = gap ? targetForGap(gap) : { type: "institutional_repository" as SourceTarget, reason: "Find a verifiable work or project" };
    out.push({ query: query.trim(), parameterCode: gap?.code || null, fieldIds: gap?.fields.slice(0, 2).map((field) => field.id) || [],
      targetSourceType: target || need.type, strategy, weaknessReason: need.reason,
      expectedKnowledgeGain: Math.max(1, 10 - strategyPenalty(strategy, input.performance || {}) + (gap?.sourceChunks === 0 ? 2 : 0)) });
  };
  const name = aliases[0] || input.name;
  const scholarlyName = aliases.find((alias) => /[^\x00-\x7F]/.test(alias)) || name;
  for (const work of (input.candidateWorks || []).slice(0, 3)) {
    const title = work.title.replace(/\s+[—|]\s+.*$/, "").trim().slice(0, 110);
    if (title.length < 12) continue;
    add(`"${title}" "${work.author || name}" full text`, ranked[0] || null, "work", "peer_reviewed_scholarship");
    add(`"${title}" university repository ${work.year || ""}`, ranked[0] || null, "repository", "institutional_repository");
    if (work.doi) add(`"${work.doi}" open access repository`, ranked[0] || null, "repository", "institutional_repository");
  }
  if (input.sourceTitles.some((title) => /rigveda|vedic/i.test(title))) {
    const gap = ranked.find((item) => targetForGap(item).type === "peer_reviewed_scholarship") || ranked[0] || null;
    add(`"${scholarlyName}" site:sanskrit-lexicon.uni-koeln.de Vedic Index`, gap, "repository", "scholarly_reference");
    add(`"${scholarlyName}" Macdonell Keith Vedic Index university scan`, gap, "work", "scholarly_reference");
    add(`"${scholarlyName}" Vedic studies site:ac.in thesis`, gap, "repository", "institutional_repository");
    add(`"${scholarlyName}" Vasistha historical philology open access journal`, gap, "journal", "peer_reviewed_scholarship");
    add(`"${scholarlyName}" Aitareya Brahmana Sunahsepa edition university`, gap, "textual_reference", "primary_edition");
    add(`"${scholarlyName}" VedaWeb Rigveda digital scholarly edition`, gap, "repository", "institutional_repository");
    add(`"${scholarlyName}" "Vedic Index of Names and Subjects"`, gap, "work", "scholarly_reference");
    add(`"${scholarlyName}" "Journal of the Royal Asiatic Society" Vedic`, gap, "journal", "peer_reviewed_scholarship");
    add(`"${scholarlyName}" "Rigveda 3.33" academic edition`, gap, "textual_reference", "primary_edition");
    add(`"${scholarlyName}" Rigvedic Ramayana historical textual development scholarship`, gap, "textual_development", "peer_reviewed_scholarship");
  }
  for (const gap of ranked.slice(0, 5)) {
    const topic = concise(gap.name);
    const need = targetForGap(gap).type;
    for (const field of gap.fields.slice(0, 1))
      add(`"${name}" "${concise(field.label)}" ${need === "primary_edition" ? "Sanskrit edition" : "academic research"}`, gap, "textual_reference");
    add(`"${name}" ${topic} ${need === "primary_edition" ? "critical edition Sanskrit text" : "scholarly journal"}`, gap, "topic");
    add(`"${name}" ${topic} university repository thesis`, gap, "repository", "institutional_repository");
    add(`"${name}" ${topic} journal Vedic Sanskrit`, gap, "journal", "peer_reviewed_scholarship");
    add(`"${name}" ${topic} textual development Rigveda Ramayana`, gap, "textual_development", "peer_reviewed_scholarship");
  }
  for (const title of input.sourceTitles.filter((item) => /rigveda|ramayana|mahabharata|vedic|sanskrit/i.test(item)).slice(0, 6)) {
    add(`"${name}" "${concise(title)}" edition`, ranked[0] || null, "work", "primary_edition");
    add(`"${name}" "${concise(title)}" scholarly analysis`, ranked[0] || null, "scholar", "scholarly_reference");
  }
  for (const term of [...input.relationships, ...input.events].slice(0, 5))
    add(`"${name}" "${concise(term)}" textual reference academic`, ranked[0] || null, "textual_reference");
  for (const domain of input.domains.slice(0, 3))
    add(`site:${domain} "${name}" ${concise(ranked[0]?.name || "Sanskrit")} edition`, ranked[0] || null, "repository");
  for (const alias of aliases.slice(1, 5))
    add(`"${alias}" ${concise(ranked[0]?.name || "Vedic")} academic`, ranked[0] || null, "variant");
  // Interleave source classes before filling the remaining slots.
  const order: QueryStrategy[] = ["repository", "work", "journal", "textual_reference", "textual_development", "variant", "scholar", "topic"];
  const groups = order.map((strategy) => out.filter((item) => item.strategy === strategy)
    .sort((a, b) => b.expectedKnowledgeGain - a.expectedKnowledgeGain));
  const result: PlannedQuery[] = [];
  while (result.length < max && groups.some((group) => group.length)) {
    const active = groups.map((group, index) => ({ group, index })).filter(({ group }) => group.length)
      .sort((a, b) => strategyPenalty(order[a.index], input.performance || {}) - strategyPenalty(order[b.index], input.performance || {}));
    for (const { group } of active) {
      if (result.length >= max) break;
      result.push(group.shift()!);
    }
  }
  return result;
}
