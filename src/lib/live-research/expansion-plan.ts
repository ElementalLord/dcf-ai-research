import { normalizeSearchQuery } from "./web-search-provider";

export type Gap = { name: string; code: string; sourceChunks: number; uniqueEvidenceSources: number; independentWorks?: number; primaryWorks?: number; scholarlyWorks?: number; claimsWithExactPassages: number; approvedClaims: number; fields: Array<{ id: string; label: string }> };
export type PlannedQuery = { query: string; parameterCode: string | null; fieldIds: string[] };

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

export function buildExpansionQueries(input: { name: string; aliases: string[]; gaps: Gap[]; sourceTitles: string[]; relationships: string[]; events: string[]; domains: string[] }, max = 25): PlannedQuery[] {
  const out: PlannedQuery[] = [];
  const seen = new Set<string>();
  const add = (query: string, parameterCode: string | null, fieldIds: string[] = []) => {
    const normalized = normalizeSearchQuery(query);
    if (!normalized || seen.has(normalized) || out.length >= max) return;
    seen.add(normalized);
    out.push({ query: query.trim(), parameterCode, fieldIds });
  };
  const aliases = [input.name, ...input.aliases.filter((alias) => normalizeSearchQuery(alias) !== normalizeSearchQuery(input.name))];
  const ranked = rankCoverageGaps(input.gaps);
  const concise = (label: string) => label.replace(/\([^)]*\)/g, " ").replace(/\s*\/\s*/g, " ").split(/[,;]/)[0].trim().split(/\s+/).slice(0, 8).join(" ");
  const primaryLocation = input.sourceTitles.map((title) => title.match(/\b(Rigveda|Ramayana|Mahabharata)\b[^,]*\b(Mandala|Book|Kanda)\s*(\d+)/i)).find(Boolean);
  if (primaryLocation) add(`${input.name} ${primaryLocation[1]} ${primaryLocation[2]} ${primaryLocation[3]} hymns public domain translation`, null);
  for (const gap of ranked.slice(0, 3)) {
    const evidenceType = gap.scholarlyWorks === 0 ? "scholarly journal open access"
      : gap.primaryWorks === 0 ? "primary text critical edition"
        : /histor|contest|philosoph|contempor/i.test(`${gap.code} ${gap.name}`)
      ? "scholarly journal open access" : "primary text critical edition";
    add(`${input.name} ${concise(gap.name)} ${evidenceType}`, gap.code, gap.fields.slice(0, 2).map((field) => field.id));
  }
  // Hosts learned from prior candidate audits refine later batches; they never authorize evidence.
  for (const domain of input.domains.slice(0, 2)) for (const gap of ranked.slice(0, 1)) {
    add(`site:${domain} ${input.name} ${concise(gap.name)} scholarly text`, gap.code);
  }
  for (const title of input.sourceTitles.filter((item) => /rigveda|ramayana|mahabharata|veda/i.test(item))
    .sort((a, b) => (/rigveda/i.test(a) ? 0 : 1) - (/rigveda/i.test(b) ? 0 : 1)).slice(0, 2)) {
    add(`${input.name} ${concise(title)} original text public domain edition`, null);
  }
  for (const gap of ranked.slice(0, 2)) for (const field of gap.fields.slice(0, 1)) {
    add(`${input.name} ${concise(field.label)} scholarly edition`, gap.code, [field.id]);
  }
  for (const gap of ranked.slice(0, 5)) add(`${input.name} ${concise(gap.name)}`, gap.code);
  const titles = [...input.sourceTitles].sort((a, b) => {
    const rank = (text: string) => /rigveda/i.test(text) ? 0 : /ramayana/i.test(text) ? 1 : /mahabharata/i.test(text) ? 2 : 3;
    return rank(a) - rank(b);
  });
  for (const title of titles.slice(0, 5)) add(`${input.name} ${concise(title)}`, null);
  for (const term of [...input.relationships, ...input.events].slice(0, 4)) add(`${input.name} ${concise(term)}`, null);
  for (const gap of ranked) {
    for (const field of gap.fields.slice(0, 2)) add(`${input.name} ${concise(field.label)}`, gap.code, [field.id]);
    add(`${input.name} ${concise(gap.name)}`, gap.code);
  }
  for (const alias of aliases.slice(1, 3)) for (const gap of ranked.slice(0, 2)) add(`${alias} ${concise(gap.name)}`, gap.code);
  return out.slice(0, max);
}
