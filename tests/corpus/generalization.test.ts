import { describe, expect, it } from "vitest";
import { eligibleClaimOrigins, evidencePolicyMode, isClaimEligible } from "@/lib/corpus/approval-policy";
import { computeCorpusCoverage } from "@/lib/corpus/coverage";
import { citationsMatchEvidence, mergePersonalityEvidence } from "@/lib/corpus/comparison";
import { buildBoundedContext } from "@/lib/corpus/context";
import { canonicalizeTerms, normalizedAliases, selectPrimaryCategory } from "@/lib/corpus/personality-config";
import { normalizeOnboardingPlan } from "@/lib/corpus/onboarding-plan";
import type { RetrievedPassage } from "@/lib/corpus/types";

function passage(personalityId: string, personalityName: string, index: number): RetrievedPassage {
  return {
    kind: "passage", id: `${personalityId}:${index}`, chunkId: `${personalityId}-chunk-${index}`,
    sourceId: `${personalityId}-source`, text: `${personalityName} evidence ${index}`,
    sectionTitle: null, pageOrSection: `Section ${index}`, textualLayer: "Primary layer",
    sourceTitle: `${personalityName} source`, sourceAuthor: null, sourceInstitution: null,
    sourceUrl: null, sourceType: "primary_text", sourceStatus: "approved", personalityId, personalityName,
  };
}

describe("general personality research pipeline", () => {
  it("loads aliases and canonicalizes relationship terms from data", () => {
    expect(normalizedAliases("Rishi A", [
      { alias: "Ṛṣi A", confidence: 1 },
      { alias: "Family A", confidence: 0.6, isAmbiguous: true },
    ])).toEqual(["rishi a", "rsi a"]);
    expect(canonicalizeTerms("Teacher Variant", [{ canonicalTerm: "teacher", alias: "teacher variant" }])).toBe("teacher");
  });

  it("selects a category framework dynamically", () => {
    expect(selectPrimaryCategory([{ category_id: "ruler", is_primary: false }, { category_id: "rishi", is_primary: true }])?.category_id).toBe("rishi");
  });

  it("separates test and strict approval policy", () => {
    expect(evidencePolicyMode("test")).toBe("test");
    expect(evidencePolicyMode("strict")).toBe("strict");
    expect(eligibleClaimOrigins("test")).toContain("system_test_bulk");
    expect(eligibleClaimOrigins("strict")).not.toContain("system_test_bulk");
    expect(isClaimEligible("approved", "mentor_review", "strict")).toBe(true);
    expect(isClaimEligible("approved", "system_test_bulk", "strict")).toBe(false);
  });

  it("measures evidence depth without calling it completeness", () => {
    const result = computeCorpusCoverage({
      parameters: [{ id: "p", code: "role", name: "Role", fields: [{ id: "f", code: "type", label: "Type" }] }],
      claims: [{ id: "c", parameterFieldId: "f", approved: true, hasChunkEvidence: true, sourceIds: ["s1"] }],
      chunks: [{ id: "x", sourceId: "s2", parameterFieldIds: ["f"], embedded: true, textualLayer: "Layer" }],
      sourceCount: 2, events: 1, relationships: 1, cachedPages: 0, approvedSourceScopes: 1,
    });
    expect(result.overall.exactPassageCoveragePercent).toBe(100);
    expect(result.parameters[0].independentEvidence).toBe(true);
    expect(result.disclaimer).toContain("does not establish");
  });

  it("keeps retrieval isolated and only merges explicitly selected personalities", () => {
    const a = passage("a", "Rishi A", 1);
    const b = passage("b", "Rishi B", 1);
    expect(mergePersonalityEvidence([
      { personalityId: "a", personalityName: "Rishi A", evidence: [a] },
      { personalityId: "b", personalityName: "Rishi B", evidence: [b] },
    ])).toEqual([a, b]);
    expect(() => mergePersonalityEvidence([{ personalityId: "a", personalityName: "Rishi A", evidence: [b] }])).toThrow("isolation");
  });

  it("keeps citation identity aligned across an intentional comparison", () => {
    const evidence = [passage("a", "Rishi A", 1), passage("b", "Rishi B", 1)];
    const bounded = buildBoundedContext(evidence);
    expect(citationsMatchEvidence(bounded.citations, bounded.selected)).toBe(true);
    expect(bounded.context).toContain("Personality: Rishi A");
    expect(bounded.context).toContain("Personality: Rishi B");
  });

  it("normalizes a bounded generic onboarding plan", () => {
    const plan = normalizeOnboardingPlan({ sourceIds: ["s1", "s1", "s2"], steps: ["embed", "tag", "extract_claims", "propose_events", "propose_relationships", "embed"], benchmarkQuestions: ["Who is Rishi A?", "Who is Rishi A?"] });
    expect(plan.sourceIds).toEqual(["s1", "s2"]);
    expect(plan.steps).toEqual(["tag", "embed", "extract_claims", "propose_events", "propose_relationships"]);
    expect(plan.benchmarkQuestions).toEqual(["Who is Rishi A?"]);
  });
});
