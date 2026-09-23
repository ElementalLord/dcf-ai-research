import { normalizeForMatch } from "@/lib/corpus/text";
import type { RetrievedEvidence } from "@/lib/corpus/types";
import { canonicalizeTerms, type TermAliasRecord } from "@/lib/corpus/personality-config";

const IGNORED = new Set(["the", "and", "his", "her", "what", "when", "where", "which", "who", "how", "does", "did", "is", "are", "was", "were", "about", "from", "with", "into", "role", "play", "played", "major", "story", "explain", "relationship", "relation", "significance", "significant", "happens"]);

function normalizeAliases(value: string, termAliases: TermAliasRecord[]): string {
  return canonicalizeTerms(value, termAliases)
    .replace(/\b(?:legacy|contributions?)\b/g, "contribution")
    .replace(/\brigvedic\b/g, "rigveda")
    .replace(/\b(?:uncertainties|uncertainty|uncertain)\b/g, "uncertain")
    .replace(/\b(?:historically|historical)\b/g, "history")
    .replace(/\bsame figure\b/g, "same name");
}

function concepts(question: string, personalityAliases: string[], termAliases: TermAliasRecord[]): string[] {
  const intentWords = new Set([
    "evidence", "link", "links", "linked", "development", "develop", "developed",
    "evolve", "evolved", "evolution", "trace", "portrayed", "reconstruct", "reconstructing",
    "references", "reference", "parts", "regarding", "different", "difference",
    "differ",
  ]);
  const ignored = new Set(IGNORED);
  for (const alias of personalityAliases) {
    for (const token of normalizeForMatch(alias).split(" ")) ignored.add(token);
  }
  return normalizeAliases(question, termAliases).split(" ").filter((term) => term.length > 2 && !ignored.has(term) && !intentWords.has(term));
}

export type SufficiencyDecision = {
  sufficient: boolean;
  mode: "FAST" | "EXPANDED" | "RESEARCH";
  coverage: number;
  reason: string;
};

export function assessEvidenceSufficiency(
  question: string,
  evidence: RetrievedEvidence[],
  options: { personalityAliases?: string[]; termAliases?: TermAliasRecord[] } = {},
): SufficiencyDecision {
  const personalityAliases = options.personalityAliases || [];
  const termAliases = options.termAliases || [];
  const requested = concepts(question, personalityAliases, termAliases);
  const evidenceTokens = new Set(normalizeAliases(evidence.slice(0, 12).map((item) => [
    item.text,
    item.sourceTitle,
    item.pageOrSection,
    item.textualLayer,
    item.kind === "claim" ? item.parameterName : null,
    item.kind === "claim" ? item.fieldLabel : null,
  ].filter(Boolean).join(" ")).join(" "), termAliases).split(" ").filter(Boolean));
  const stem = (term: string) => term === "taught" ? "teach" : term.replace(/(ing|ers?|ed)$/i, "");
  const covered = requested.filter((term) => {
    const termStem = stem(term);
    return [...evidenceTokens].some((token) => token === term || (termStem.length >= 4 && stem(token) === termStem));
  });
  const coverage = requested.length ? covered.length / requested.length : 0;
  const direct = evidence.filter((item) => item.kind === "claim" || (item.lexicalScore || 0) > 0).length;
  const sources = new Set(evidence.map((item) => item.kind === "passage" ? item.sourceId : item.sourceTitle).filter(Boolean));
  const layers = new Set(evidence.map((item) => item.textualLayer).filter(Boolean));
  const comparative = /compare|differ|difference|across|contested|disagree|conflict/i.test(question);
  const developmental = /development|trace|transform|evolv/i.test(question);
  const complex = comparative || developmental;
  const broadProfile = /\b(who is|known for|tell me about|overview|biograph|profile|introduce)\b/i.test(question);
  const mode = complex ? "RESEARCH" : "EXPANDED";
  if (evidence.length === 0 || direct === 0) return { sufficient: false, mode, coverage, reason: "No directly relevant approved local evidence." };
  if (broadProfile) {
    return evidence.length >= 3
      ? { sufficient: true, mode: "FAST", coverage: 1, reason: "A diverse approved local profile is available." }
      : { sufficient: false, mode: "EXPANDED", coverage, reason: "The broad profile needs evidence from several approved records." };
  }
  if (coverage < 0.67) return { sufficient: false, mode, coverage, reason: "Local evidence does not cover enough requested concepts." };
  if (comparative && (sources.size < 2 || layers.size < 2)) {
    return { sufficient: false, mode: "RESEARCH", coverage, reason: "The comparison needs broader source or textual-layer coverage." };
  }
  return { sufficient: true, mode: "FAST", coverage, reason: "Approved local evidence directly covers the question." };
}
