import { DIRECT_EVIDENCE_TYPES } from "./contracts";
import { TYPE_LABELS, type ContractStatus, type EpistemicType } from "./types";

/** A claim's persisted epistemic state, as coverage and depth consume it. */
export type ClaimEpistemicState = { type: EpistemicType | null; status: ContractStatus; satisfied: boolean | null; needsTypeReview: boolean };
/* An unresolved type whose contract outcome holds under every plausible type is satisfied = true; it is still
   counted as awaiting review, but only type-DEPENDENT outcomes count against the review guard. */

export type ContractStats = {
  /** Claims about the subject (methodological notes excluded). */
  evidentiary: number; satisfied: number;
  core: number; coreSatisfied: number;
  /** Claims whose contract requires direct factual or textual evidence. */
  direct: number; directSatisfied: number;
  coreHistoricalNarrativeOnly: number;
  historicalNarrativeOnly: number;
  awaitingType: number;
  /** Untyped claims whose contract outcome depends on which type they turn out to be. */
  typeDependent: number;
  /** Claims with no persisted evaluation yet (counted as unmet, never as met). */
  unevaluated: number;
  methodological: number;
  contestedRepresented: number; contestedUnrepresented: number;
  byType: Partial<Record<EpistemicType, { total: number; satisfied: number }>>;
};

export function contractStats(claims: Array<{ core: boolean; epistemic?: ClaimEpistemicState | null }>): ContractStats {
  const stats: ContractStats = { evidentiary: 0, satisfied: 0, core: 0, coreSatisfied: 0, direct: 0, directSatisfied: 0, coreHistoricalNarrativeOnly: 0,
    historicalNarrativeOnly: 0, awaitingType: 0, typeDependent: 0, unevaluated: 0, methodological: 0, contestedRepresented: 0, contestedUnrepresented: 0, byType: {} };
  for (const claim of claims) {
    const state = claim.epistemic;
    if (state?.status === "NOT_EVIDENTIARY") { stats.methodological++; continue; }
    stats.evidentiary++;
    const met = state?.satisfied === true;
    if (!state) stats.unevaluated++;
    if (state && (state.needsTypeReview || !state.type)) { stats.awaitingType++; if (!met) stats.typeDependent++; }
    if (met) stats.satisfied++;
    if (claim.core) { stats.core++; if (met) stats.coreSatisfied++; }
    if (state?.type) {
      const entry = stats.byType[state.type] || { total: 0, satisfied: 0 };
      entry.total++; if (met) entry.satisfied++;
      stats.byType[state.type] = entry;
      if (DIRECT_EVIDENCE_TYPES.has(state.type)) { stats.direct++; if (met) stats.directSatisfied++; }
      if (state.status === "INSUFFICIENT_FOR_HISTORICAL_CLAIM") { stats.historicalNarrativeOnly++; if (claim.core) stats.coreHistoricalNarrativeOnly++; }
      if (state.type === "CONTESTED") { if (met) stats.contestedRepresented++; else stats.contestedUnrepresented++; }
    }
  }
  return stats;
}

const ratio = (part: number, whole: number) => whole ? part / whole : 1;

/**
 * Contract sufficiency for one parameter. Direct-evidence claims keep the same 70% floor the exact-coverage
 * rule had (no weakening); every evidentiary claim must meet its own contract at 70%, core claims at 70%;
 * a core historical claim resting only on narrative blocks GOOD; untyped claims cannot carry a parameter.
 */
export function contractSufficient(stats: ContractStats): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!stats.evidentiary) return stats.methodological ? { ok: false, reasons: ["Only method notes; no evidentiary claims"] } : { ok: true, reasons };
  if (stats.direct && ratio(stats.directSatisfied, stats.direct) < 0.7) reasons.push("Direct-evidence claims lack exact supporting passages");
  if (ratio(stats.satisfied, stats.evidentiary) < 0.7) reasons.push("Claims do not meet their evidence contracts");
  if (stats.core && ratio(stats.coreSatisfied, stats.core) < 0.7) reasons.push("Core claims do not meet their evidence contracts");
  if (stats.coreHistoricalNarrativeOnly) reasons.push(`${stats.coreHistoricalNarrativeOnly} core historical claim(s) rely only on narrative evidence`);
  if (ratio(stats.typeDependent, stats.evidentiary) > 0.2) reasons.push("Too many claims await a type review that would change their outcome");
  // Excluding method notes must not be what carries a parameter.
  if (stats.methodological / (stats.methodological + stats.evidentiary) > 0.25) reasons.push("Too many claims are method notes rather than evidence about the subject");
  return { ok: reasons.length === 0, reasons };
}

const VERB: Partial<Record<EpistemicType, string>> = {
  TEXTUAL_ASSERTION: "have an exact passage in the text",
  TRADITIONAL_NARRATIVE: "have an exact passage of the narrative",
  HISTORICAL_FACT: "have independent historical/scholarly corroboration",
  HISTORICAL_INFERENCE: "are grounded as inferences",
  SCHOLARLY_ATTRIBUTION: "are directly stated in the attributed work",
  SCHOLARLY_INTERPRETATION: "have substantial interpretive support",
  SYNTHETIC_INTERPRETATION: "are supported across two independent works",
  MODERN_RECEPTION: "are supported by a modern source",
  NORMATIVE_RELEVANCE: "are attributed or grounded as labeled synthesis",
  CONTESTED: "have their disagreement represented",
};

/** Human-readable reasons behind a parameter's depth, e.g. "5/5 traditional narrative claims have an exact passage". */
export function explainContracts(stats: ContractStats): string[] {
  const lines = [`${stats.coreSatisfied}/${stats.core} core claims meet their evidence contracts`,
    `${stats.satisfied}/${stats.evidentiary} claims meet their evidence contracts`];
  for (const [type, entry] of Object.entries(stats.byType) as Array<[EpistemicType, { total: number; satisfied: number }]>)
    lines.push(`${entry.satisfied}/${entry.total} ${TYPE_LABELS[type]} claims ${VERB[type] || "meet their contract"}`);
  if (stats.historicalNarrativeOnly) lines.push(`${stats.historicalNarrativeOnly} historical claim(s) rely only on narrative evidence`);
  if (stats.awaitingType) lines.push(`${stats.awaitingType} claim(s) await type review (${stats.typeDependent} with a type-dependent outcome)`);
  if (stats.methodological) lines.push(`${stats.methodological} research-method note(s) excluded from evidence coverage`);
  return lines;
}

export type MetricScope = "strict" | "test";

/**
 * Strict production metrics exclude approvals that rest only on an AI review (approval_metadata.ai_reviewed or
 * an ai_candidate origin) until a human confirms them. Test metrics include them, and are reported separately.
 */
export function inMetricScope(claim: { approval_origin?: string | null; approval_metadata?: Record<string, unknown> | null }, scope: MetricScope): boolean {
  if (scope === "test") return true;
  const metadata = claim.approval_metadata || {};
  const humanConfirmed = metadata.human_confirmed === true || metadata.reviewerKind === "human";
  return humanConfirmed || (metadata.ai_reviewed !== true && claim.approval_origin !== "ai_candidate");
}
