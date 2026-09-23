import { normalizeForMatch } from "./text";

export type EvidencePolicyRecord = {
  kind: "claim" | "passage" | "candidate";
  reviewStatus?: string | null;
  sourceStatus?: string | null;
};

export function isEvidenceEligible(record: EvidencePolicyRecord): boolean {
  if (record.kind === "candidate") return false;
  if (record.kind === "claim") return record.reviewStatus === "approved";
  return record.sourceStatus === "approved";
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || left.length !== right.length) return 0;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

export function lexicalScore(query: string, text: string): number {
  const queryTerms = new Set(normalizeForMatch(query).split(" ").filter((term) => term.length > 2));
  const normalizedText = normalizeForMatch(text);
  return [...queryTerms].reduce((score, term) => score + (normalizedText.includes(term) ? 1 : 0), 0);
}

export function requiresNarrativeFraming(textualLayer: string | null | undefined): boolean {
  const layer = normalizeForMatch(textualLayer || "");
  return ["ramayana", "mahabharata", "epic", "purana", "traditional narrative"].some((term) => layer.includes(term));
}

export function shouldAbstain(evidenceCount: number): boolean {
  return evidenceCount === 0;
}
