export const APPROVAL_ORIGINS = [
  "human_manual",
  "mentor_review",
  "system_test_bulk",
  "imported_existing",
  "ai_candidate",
  "automated_evidence_verification",
  "corpus_evidence_review",
] as const;

export type ApprovalOrigin = (typeof APPROVAL_ORIGINS)[number];
export type EvidencePolicyMode = "test" | "strict";

export function evidencePolicyMode(value = process.env.EVIDENCE_POLICY_MODE): EvidencePolicyMode {
  return value?.trim().toLowerCase() === "test" ? "test" : "strict";
}

export function eligibleClaimOrigins(mode: EvidencePolicyMode): ApprovalOrigin[] {
  return mode === "strict"
    ? ["human_manual", "mentor_review", "automated_evidence_verification", "corpus_evidence_review"]
    : ["human_manual", "mentor_review", "system_test_bulk", "imported_existing", "automated_evidence_verification", "corpus_evidence_review"];
}

export function isClaimEligible(
  reviewStatus: string,
  approvalOrigin: string | null | undefined,
  mode: EvidencePolicyMode,
): boolean {
  return reviewStatus === "approved" && eligibleClaimOrigins(mode).includes(
    (approvalOrigin || "imported_existing") as ApprovalOrigin,
  );
}

export function approvalOriginLabel(origin: string | null | undefined): string {
  const labels: Record<string, string> = {
    human_manual: "Human/manual",
    mentor_review: "Mentor-reviewed",
    system_test_bulk: "System test bulk",
    imported_existing: "Imported existing",
    ai_candidate: "AI candidate",
    automated_evidence_verification: "Automatically evidence-verified",
    corpus_evidence_review: "Corpus evidence-reviewed",
  };
  return labels[origin || ""] || "Unknown origin";
}
