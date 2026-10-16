export type ReviewEvidenceLink = { relationship?: string | null; confidence?: number | null; link_method?: string | null; metadata?: Record<string, unknown> | null };
export type ReviewSourceLink = { source_id?: string | null; evidence_excerpt?: string | null; page_or_section?: string | null };
export type ProposedEvidenceAssessment = {
  status: "supported" | "partially_supported" | "unsupported" | "contradicted" | "needs_investigation";
  label: string;
  confidence: number;
  reasons: string[];
  independentCorroborationNeeded: boolean;
  humanReviewRequired: true;
};

/** A deterministic proposal only. It never writes a claim review decision. */
export function proposeEvidenceAssessment(claim: { claim_chunks?: ReviewEvidenceLink[] | null; claim_sources?: ReviewSourceLink[] | null }): ProposedEvidenceAssessment {
  const chunks = claim.claim_chunks || [];
  const sources = claim.claim_sources || [];
  const uniqueSources = new Set(sources.map((source) => source.source_id).filter(Boolean));
  const contradiction = chunks.some((link) => link.relationship === "contradicts");
  const exact = chunks.some((link) => link.relationship === "supports" && (/exact|manual/i.test(link.link_method || "") || Number(link.confidence) >= .85));
  const partial = chunks.some((link) => link.relationship === "supports") || sources.some((link) => Boolean(link.evidence_excerpt));
  const independentCorroborationNeeded = uniqueSources.size < 2;
  if (contradiction) return { status: "contradicted", label: "Contradicted — conflicts with cited evidence", confidence: .95,
    reasons: ["At least one linked passage is explicitly marked as contradicting the claim."], independentCorroborationNeeded, humanReviewRequired: true };
  if (exact) return { status: "supported", label: "Supported — ready for human review", confidence: .9,
    reasons: ["An exact or high-confidence supporting passage is linked.", ...(independentCorroborationNeeded ? ["Independent corroboration is still needed."] : [])], independentCorroborationNeeded, humanReviewRequired: true };
  if (partial) return { status: "partially_supported", label: "Partially supported — revision required", confidence: .65,
    reasons: [chunks.length ? "A supporting passage exists, but its link is not exact or high-confidence." : "A source excerpt exists without a resolved supporting passage.", ...(independentCorroborationNeeded ? ["Independent corroboration is needed."] : [])], independentCorroborationNeeded, humanReviewRequired: true };
  if (sources.length) return { status: "needs_investigation", label: "Needs investigation — uncertain", confidence: .3,
    reasons: ["A source record is linked, but no supporting excerpt or local passage is available."], independentCorroborationNeeded, humanReviewRequired: true };
  return { status: "unsupported", label: "Unsupported — insufficient evidence", confidence: .1,
    reasons: ["No source or passage evidence is linked."], independentCorroborationNeeded: true, humanReviewRequired: true };
}
