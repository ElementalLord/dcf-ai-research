import { describe, expect, it } from "vitest";
import { assessReadiness, type ReadinessInput } from "@/lib/quality/readiness";

const base: ReadinessInput = { sources: 12, domains: 4, primarySources: 2, authoritativeSources: 4, passages: 24, totalClaims: 14,
  approvedClaims: 12, rejectedClaims: 0, claimsWithPassages: 11, supportedContracts: 10, evaluatedContracts: 12,
  evaluationQuestions: 12, evaluationPasses: 11, citationValid: 12, citationSupported: 11, retrievalSuccesses: 12,
  averageLatencyMs: 800, externalSearches: 0, largestDomainSourceCount: 4 };

describe("readiness thresholds", () => {
  it("requires measured evaluation for STRONG", () => {
    expect(assessReadiness(base).retrievalState).toBe("STRONG");
    expect(assessReadiness({ ...base, evaluationQuestions: 0 }).retrievalState).toBe("USABLE");
  });
  it("does not let a large concentrated source list hide weak evidence", () => {
    const result = assessReadiness({ ...base, sources: 100, domains: 1, largestDomainSourceCount: 95, passages: 1 });
    expect(result.retrievalState).toBe("NEEDS ATTENTION");
    expect(result.gaps.join(" ")).toMatch(/one domain|locally retrievable/i);
  });
  it("keeps publication readiness separate from retrieval readiness", () => {
    const result = assessReadiness({ ...base, totalClaims: 120, approvedClaims: 12 });
    expect(result.retrievalState).toBe("STRONG");
    expect(result.publicationState).not.toBe("STRONG");
  });
});
