import { normalizeForMatch } from "@/lib/corpus/text";
import type { RetrievedEvidence } from "@/lib/corpus/types";

const IGNORED = new Set(["the", "and", "his", "her", "what", "when", "where", "which", "who", "how", "does", "did", "is", "are", "was", "were", "about", "from", "with", "into", "role", "play", "played", "major", "story", "explain", "relationship", "relation", "significance", "significant", "happens", "vishvamitra", "vishwamitra", "visvamitra"]);

function normalizeAliases(value: string): string {
  return normalizeForMatch(value)
    .replace(/\b(?:vasishta|vashishta|vasishtha|vasista|vashista)\b/g, "vasistha")
    .replace(/\b(?:legacy|contributions?)\b/g, "contribution")
    .replace(/\brigvedic\b/g, "rigveda")
    .replace(/\b(?:uncertainties|uncertainty|uncertain)\b/g, "uncertain")
    .replace(/\b(?:historically|historical)\b/g, "history")
    .replace(/\bsame figure\b/g, "same name");
}

function concepts(question: string): string[] {
  const intentWords = new Set([
    "evidence", "link", "links", "linked", "development", "develop", "developed",
    "evolve", "evolved", "evolution", "trace", "portrayed", "reconstruct", "reconstructing",
    "references", "reference", "parts", "regarding", "different", "difference",
    "differ",
  ]);
  return normalizeAliases(question).split(" ").filter((term) => term.length > 2 && !IGNORED.has(term) && !intentWords.has(term));
}

export type SufficiencyDecision = {
  sufficient: boolean;
  mode: "FAST" | "EXPANDED" | "RESEARCH";
  coverage: number;
  reason: string;
};

export function assessEvidenceSufficiency(question: string, evidence: RetrievedEvidence[]): SufficiencyDecision {
  const requested = concepts(question);
  const evidenceTokens = new Set(normalizeAliases(evidence.slice(0, 12).map((item) => [
    item.text,
    item.sourceTitle,
    item.pageOrSection,
    item.textualLayer,
    item.kind === "claim" ? item.parameterName : null,
    item.kind === "claim" ? item.fieldLabel : null,
  ].filter(Boolean).join(" ")).join(" ")).split(" ").filter(Boolean));
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
  const asksAcrossLayers = /rigved|vedic/i.test(question) && /ramayana|epic/i.test(question);
  const broadProfile = /\b(who is|known for|tell me about|overview|biograph|profile|introduce)\b/i.test(question);
  const mode = complex || asksAcrossLayers ? "RESEARCH" : evidence.length ? "EXPANDED" : "EXPANDED";
  if (evidence.length === 0 || direct === 0) return { sufficient: false, mode, coverage, reason: "No directly relevant approved local evidence." };
  if (broadProfile) {
    return evidence.length >= 3
      ? { sufficient: true, mode: "FAST", coverage: 1, reason: "A diverse approved local profile is available." }
      : { sufficient: false, mode: "EXPANDED", coverage, reason: "The broad profile needs evidence from several approved records." };
  }
  if (coverage < 0.67) return { sufficient: false, mode, coverage, reason: "Local evidence does not cover enough requested concepts." };
  if ((comparative && sources.size < 2) || (asksAcrossLayers && layers.size < 2)) {
    return { sufficient: false, mode: "RESEARCH", coverage, reason: "The comparison needs broader source or textual-layer coverage." };
  }
  return { sufficient: true, mode: "FAST", coverage, reason: "Approved local evidence directly covers the question." };
}
