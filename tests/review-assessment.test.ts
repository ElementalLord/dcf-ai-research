import { describe, expect, it } from "vitest";
import { proposeEvidenceAssessment } from "@/lib/quality/review-assessment";

describe("proposed evidence assessment", () => {
  it("recognizes exact support without approving anything", () => {
    const result = proposeEvidenceAssessment({ claim_sources: [{ source_id: "a", evidence_excerpt: "Evidence" }], claim_chunks: [{ relationship: "supports", confidence: .9, link_method: "manual_exact_passage" }] });
    expect(result.status).toBe("supported");
    expect(result.humanReviewRequired).toBe(true);
  });
  it("gives contradiction precedence", () => {
    const result = proposeEvidenceAssessment({ claim_chunks: [{ relationship: "supports", confidence: .9 }, { relationship: "contradicts" }] });
    expect(result.status).toBe("contradicted");
  });
  it("does not confuse a source record with passage support", () => {
    expect(proposeEvidenceAssessment({ claim_sources: [{ source_id: "a" }] }).status).toBe("needs_investigation");
  });
});
