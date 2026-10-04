import { isBroadSynthesisQuestion } from "./routing";
import { CorpusError } from "./errors";
import { generateText, parseGeminiJson } from "./gemini";
import { normalizeForMatch, truncateText } from "./text";
import type { RetrievedEvidence } from "./types";
import { canonicalizeTerms, type TermAliasRecord } from "./personality-config";

function evidenceKey(item: RetrievedEvidence): string {
  return item.kind === "claim" ? `claim:${item.claimId}` : `passage:${item.chunkId}`;
}

function canonical(value: string, termAliases: TermAliasRecord[]): string {
  return canonicalizeTerms(value, termAliases)
    .replace(/\b(?:legacy|contributions?)\b/g, "contribution");
}

function deterministicOrder(
  question: string,
  evidence: RetrievedEvidence[],
  options: { personalityAliases: string[]; termAliases: TermAliasRecord[] },
): RetrievedEvidence[] {
  if (isBroadSynthesisQuestion(question)) return evidence;
  const ignored = new Set(["the", "and", "what", "who", "how", "why", "his", "her", "with", "from", "about", "into", "role", "play", "played", "story", "explain", "relationship", "relation", "significance", "significant", "major", "biggest", "greatest", "main", "most", "important", "influential", "primary", "best", "known"]);
  for (const alias of options.personalityAliases) {
    for (const token of normalizeForMatch(alias).split(" ")) ignored.add(token);
  }
  const terms = [...new Set(canonical(question, options.termAliases).split(" ").filter((term) => (term.length > 2 || /^\d+$/.test(term)) && !ignored.has(term)))];
  const score = (item: RetrievedEvidence) => {
    const metadata = item.kind === "claim"
      ? `${item.parameterName || ""} ${item.fieldLabel || ""}`
      : `${item.sourceTitle} ${item.sectionTitle || ""} ${item.pageOrSection || ""} ${item.textualLayer || ""}`;
    const searchable = canonical(`${metadata} ${item.text}`, options.termAliases);
    const relevance = terms.reduce((sum, term) => {
      const occurrences = Math.min(3, searchable.split(term).length - 1);
      const firstIndex = searchable.indexOf(term);
      const earlySummaryBoost = firstIndex >= 0 ? Math.max(0, 8 - Math.floor(firstIndex / 50)) : 0;
      return sum + occurrences + earlySummaryBoost;
    }, 0);
    const phrase = canonical(question, options.termAliases).match(/\b\d+(?: \d+)+\b/)?.[0];
    const exactReference = phrase && searchable.includes(phrase) ? 40 : 0;
    const approvedClaim = item.kind === "claim" ? 18 : 0;
    const directSupport = item.kind === "claim" && item.chunkId ? 4 : 0;
    const sourceQuality = /primary_text|scholarly/.test(item.sourceType || "") ? 2 : 0;
    return (relevance + exactReference + approvedClaim + directSupport + sourceQuality) * 100 + (item.fusedScore || 0);
  };
  return evidence.map((item, index) => ({ item, index, score: score(item) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ item }) => item);
}

export function selectDiverseLayers(evidence: RetrievedEvidence[], limit: number): RetrievedEvidence[] {
  const groups = new Map<string, RetrievedEvidence[]>();
  for (const item of evidence) {
    const layer = (item.textualLayer || item.sourceType || "unspecified").split(/[—,]/)[0].trim();
    groups.set(layer, [...(groups.get(layer) || []), item]);
  }
  const selected: RetrievedEvidence[] = [];
  const sourceCounts = new Map<string, number>();
  for (let depth = 0; selected.length < limit; depth += 1) {
    let found = false;
    for (const group of groups.values()) {
      const item = group[depth];
      if (!item) continue;
      found = true;
      const source = item.kind === "passage" ? item.sourceId : item.sourceTitle || item.id;
      if ((sourceCounts.get(source) || 0) >= 3) continue;
      selected.push(item);
      sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
      if (selected.length >= limit) break;
    }
    if (!found) break;
  }
  return selected;
}

/** Greedy coverage over approved records. A parameter is a bonus, never a quota. */
export function selectBroadEvidence(evidence: RetrievedEvidence[], limit = 20, personalityAliases: string[] = []): RetrievedEvidence[] {
  const pool = evidence.filter((item) => !/parameters to study|research framework/i.test(item.sourceTitle || "")
    && !/current source set|current corpus|should be stored|does not justify|metadata rather than/i.test(item.text)
    && (item.kind === "claim" || Boolean(item.parameterCodes?.length)
      || personalityAliases.some((alias) => normalizeForMatch(`${item.text} ${item.sourceTitle}`).includes(normalizeForMatch(alias)))));
  const selected: RetrievedEvidence[] = [];
  const tokens = pool.map((item) => new Set(normalizeForMatch(item.text).split(" ").filter((word) => word.length > 2)));
  const selectedTokens: Array<Set<string>> = [];
  const jaccard = (left: Set<string>, right: Set<string>) => {
    let shared = 0;
    for (const word of left) if (right.has(word)) shared += 1;
    return shared / Math.max(1, left.size + right.size - shared);
  };
  const seenParameters = new Set<string>();
  const seenSources = new Map<string, number>();
  const seenLayers = new Set<string>();
  const seenTypes = new Set<string>();
  while (selected.length < limit && pool.length) {
    let winner = -1;
    let best = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < pool.length; index += 1) {
      const item = pool[index];
      if (selectedTokens.some((prior) => jaccard(prior, tokens[index]) >= 0.73)) continue;
      const source = item.kind === "passage" ? item.sourceId : item.sourceTitle || item.id;
      const sourceCount = seenSources.get(source) || 0;
      if (sourceCount >= 4) continue;
      const parameters = item.kind === "claim" ? [item.parameterCode || item.parameterName || ""] : item.parameterCodes || [];
      const newParameters = parameters.filter((parameter) => parameter && !seenParameters.has(parameter)).length;
      const layer = item.textualLayer || "";
      const sourceType = item.sourceType || "";
      const quality = item.kind === "claim" ? (item.chunkId ? 4 : 1) : 2;
      const namesSubject = personalityAliases.some((alias) => normalizeForMatch(`${item.text} ${item.sourceTitle || ""}`).includes(normalizeForMatch(alias)));
      const score = newParameters * 12 + (sourceCount ? 0 : 5) + (layer && !seenLayers.has(layer) ? 4 : 0)
        + (sourceType && !seenTypes.has(sourceType) ? 2 : 0) + quality - sourceCount * 5
        + (item.kind === "passage" && !namesSubject && !/rigveda|vedas?/i.test(item.sourceTitle) ? -10 : 0)
        + Math.min(3, (item.fusedScore || 0) * 70) - index * 0.003;
      if (score > best) { best = score; winner = index; }
    }
    if (winner < 0) break;
    const [item] = pool.splice(winner, 1);
    selectedTokens.push(tokens.splice(winner, 1)[0]);
    selected.push(item);
    for (const parameter of item.kind === "claim" ? [item.parameterCode || item.parameterName || ""] : item.parameterCodes || []) {
      if (parameter) seenParameters.add(parameter);
    }
    const source = item.kind === "passage" ? item.sourceId : item.sourceTitle || item.id;
    seenSources.set(source, (seenSources.get(source) || 0) + 1);
    if (item.textualLayer) seenLayers.add(item.textualLayer);
    if (item.sourceType) seenTypes.add(item.sourceType);
  }
  return selected;
}

export function modelRerankEnabled(value = process.env.ENABLE_MODEL_RERANK): boolean {
  return value === "true";
}

export async function rerankEvidence(
  question: string,
  evidence: RetrievedEvidence[],
  maxSelected = 16,
  options: { personalityAliases?: string[]; termAliases?: TermAliasRecord[]; allowModel?: boolean } = {},
): Promise<RetrievedEvidence[]> {
  const ordered = deterministicOrder(question, evidence, {
    personalityAliases: options.personalityAliases || [],
    termAliases: options.termAliases || [],
  });
  if (!options.allowModel || ordered.length <= 32 || !modelRerankEnabled()) {
    return /compare|differ|difference|across|contested|conflict/i.test(question)
      ? selectDiverseLayers(ordered, maxSelected)
      : ordered.slice(0, maxSelected);
  }
  const candidates = ordered.slice(0, 32);
  const prompt = `You are a retrieval reranker. Return JSON only as {"ids":["..."]}.
Rank evidence strictly by how directly it helps answer the question.
Do not add facts and do not answer the question.
Prefer source diversity and exact textual references. Exclude irrelevant evidence.
Return at most ${maxSelected} IDs chosen only from the records below.

QUESTION: ${question}

${candidates.map((item) => `ID ${evidenceKey(item)}\nTYPE ${item.kind}\n${truncateText(item.text, 850)}`).join("\n\n")}`;
  try {
    const { text } = await generateText(prompt, { timeoutMs: 5_000, errorCode: "RERANK_FAILED" });
    const parsed = parseGeminiJson<{ ids?: string[] }>(text);
    const byId = new Map(candidates.map((item) => [evidenceKey(item), item]));
    const selected = (parsed.ids || []).map((id) => byId.get(id)).filter((item): item is RetrievedEvidence => Boolean(item));
    return selected.length > 0 ? selected.slice(0, maxSelected) : candidates.slice(0, maxSelected);
  } catch (error) {
    if (error instanceof CorpusError) return candidates.slice(0, maxSelected);
    return candidates.slice(0, maxSelected);
  }
}
