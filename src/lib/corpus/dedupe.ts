import type { RetrievedEvidence } from "./types";
import { normalizeForMatch } from "./text";

export function normalizedClaim(value: string): string {
  return normalizeForMatch(value);
}

export function tokenJaccard(a: string, b: string): number {
  const stopWords = new Set(["a", "an", "the", "is", "was", "were", "by", "to", "of", "in", "on", "and"]);
  const terms = (value: string) => normalizeForMatch(value).split(" ").filter((term) => term && !stopWords.has(term));
  const left = new Set(terms(a));
  const right = new Set(terms(b));
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

export function reciprocalRankFusion(
  rankings: RetrievedEvidence[][],
  constant = 60,
): RetrievedEvidence[] {
  const scores = new Map<string, { item: RetrievedEvidence; score: number }>();
  for (const ranking of rankings) {
    ranking.forEach((item, index) => {
      const key = item.kind === "passage" ? `passage:${item.chunkId}` : `claim:${item.claimId}`;
      const existing = scores.get(key) || { item, score: 0 };
      existing.score += 1 / (constant + index + 1);
      scores.set(key, existing);
    });
  }
  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .map(({ item, score }) => ({ ...item, fusedScore: score }));
}

export function dedupeEvidence(
  evidence: RetrievedEvidence[],
  similarityThreshold = 0.82,
): RetrievedEvidence[] {
  const kept: RetrievedEvidence[] = [];
  for (const item of evidence) {
    const text = item.text;
    const duplicate = kept.some((existing) => {
      if (existing.kind !== item.kind) return false;
      if (item.kind === "passage" && existing.kind === "passage") {
        if (item.sourceId !== existing.sourceId) return false;
      }
      return tokenJaccard(text, existing.text) >= similarityThreshold;
    });
    if (!duplicate) kept.push(item);
  }
  return kept;
}
