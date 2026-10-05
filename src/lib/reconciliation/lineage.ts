import { nearDuplicate, normalizedClaimText } from "./analysis";

export type ParentClaim = { id: string; personality_id: string; claim_text: string; certainty: string | null; parameter_field_id: string | null; claim_kind: string | null; evidence_type: string | null };
export type ReconciliationItem = { id: string; chunk_id: string; locator_raw: string | null; reasons: string[] | null; deterministic: boolean;
  assessment: { identity?: string; locatorFit?: string; interpretivePropositions?: number; factualPropositions?: number } | null };

/**
 * Everything an approved atomic refinement records about where it came from: the parent claim, the
 * supporting passage, the cited work/locator, the reason for the split, and who reviewed it. The parent
 * keeps its own text and approval; it is only flagged when the child carries all of its factual content.
 */
export function atomicChildPlan(parent: ParentClaim, item: ReconciliationItem, text: string, review: { reviewer: string; reviewerKind: "human" | "ai_assisted"; at: string }, siblingTypes: string[] = []) {
  const provenance = { reviewer: review.reviewer, reviewerKind: review.reviewerKind, reconciliationId: item.id, reviewedAt: review.at };
  return {
    candidate: { personality_id: parent.personality_id, parameter_field_id: parent.parameter_field_id, source_chunk_id: item.chunk_id, claim_text: text,
      claim_kind: parent.claim_kind || "traditional_account", certainty: parent.certainty || "unknown", extraction_confidence: 0.95, status: "pending",
      extraction_note: `Atomic refinement of approved claim ${parent.id} (reconciliation ${item.id}); reasons: ${(item.reasons || []).join(", ")}` },
    claim: { review_status: "approved", parent_claim_id: parent.id, evidence_type: childEvidenceType(parent.evidence_type, siblingTypes),
      // An AI-assisted approval is a testing approval (usable in test mode, never mentor sign-off); a human approval is manual.
      approval_origin: review.reviewerKind === "human" ? "human_manual" : "system_test_bulk",
      researcher_notes: `Atomic refinement of ${parent.id}; reviewed by ${review.reviewer} (${review.reviewerKind}).`,
      approval_metadata: { ...provenance, parentClaimId: parent.id, testing_only: review.reviewerKind !== "human", ai_reviewed: review.reviewerKind !== "human",
        approval_actor: review.reviewer, approval_reason: "evidence reconciliation atomic refinement" } },
    citation: { page_or_section: item.locator_raw },
    link: { link_method: "reconciliation_exact", relationship: "supports", confidence: 0.95,
      metadata: { supportLevel: "EXACT", identity: item.assessment?.identity, locatorFit: item.assessment?.locatorFit,
        basis: item.deterministic ? "evidence policy" : "reviewer-confirmed translation equivalence", parentClaimId: parent.id, ...provenance } },
    parentPossiblyRedundant: (item.assessment?.interpretivePropositions || 0) === 0 && (item.assessment?.factualPropositions || 0) <= 1,
  };
}

/** An existing claim (other than the parent) that already says the same thing, in the same parameter or verbatim. */
export function existingEquivalent(parent: ParentClaim, text: string, claims: Array<{ id: string; claim_text: string; parameter_field_id: string | null }>) {
  return claims.find((claim) => claim.id !== parent.id && nearDuplicate(claim.claim_text, text)
    && (claim.parameter_field_id === parent.parameter_field_id || normalizedClaimText(claim.claim_text) === normalizedClaimText(text))) || null;
}

const INTERPRETIVE_TYPES = new Set(["scholarly_interpretation", "modern_spiritual_interpretation", "historical_inference"]);

/**
 * A factual core lifted out of an interpretive parent is not itself an interpretation. Its evidence type follows
 * how the corpus already labels non-interpretive claims from the same source (data, not a per-tradition rule).
 */
export function childEvidenceType(parentType: string | null, siblingTypes: string[]): string | null {
  if (!parentType || !INTERPRETIVE_TYPES.has(parentType)) return parentType;
  const counts = new Map<string, number>();
  for (const type of siblingTypes) if (type && !INTERPRETIVE_TYPES.has(type)) counts.set(type, (counts.get(type) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || "uncertain";
}
