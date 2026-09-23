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
    return relevance * 100 + (item.fusedScore || 0);
  };
  return evidence.map((item, index) => ({ item, index, score: score(item) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ item }) => item);
}

export function modelRerankEnabled(value = process.env.ENABLE_MODEL_RERANK): boolean {
  return value === "true";
}

export async function rerankEvidence(
  question: string,
  evidence: RetrievedEvidence[],
  maxSelected = 16,
  options: { personalityAliases?: string[]; termAliases?: TermAliasRecord[] } = {},
): Promise<RetrievedEvidence[]> {
  const ordered = deterministicOrder(question, evidence, {
    personalityAliases: options.personalityAliases || [],
    termAliases: options.termAliases || [],
  });
  if (ordered.length <= 32 || !modelRerankEnabled()) return ordered.slice(0, maxSelected);
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
