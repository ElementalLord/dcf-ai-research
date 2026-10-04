import { normalizeSearchQuery } from "./web-search-provider";

export type Gap = { name: string; code: string; sourceChunks: number; uniqueEvidenceSources: number; claimsWithExactPassages: number; approvedClaims: number; fields: Array<{ id: string; label: string }> };
export type PlannedQuery = { query: string; parameterCode: string | null; fieldIds: string[] };

export function rankCoverageGaps(gaps: Gap[]): Gap[] {
  return [...gaps].sort((a, b) => {
    const score = (gap: Gap) => (gap.sourceChunks === 0 ? 12 : 0) + (gap.uniqueEvidenceSources < 2 ? 6 : 0)
      + (gap.approvedClaims ? (1 - gap.claimsWithExactPassages / gap.approvedClaims) * 10 : 4)
      + (gap.sourceChunks < 3 ? 1 : 0);
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
  // Domain-limited variants follow broader searches; source policy checks every result regardless.
  for (const domain of input.domains.slice(0, 2)) for (const gap of ranked.slice(0, 2)) add(`site:${domain} ${input.name} ${concise(gap.name)}`, gap.code);
  return out.slice(0, max);
}
