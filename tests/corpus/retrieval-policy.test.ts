import { describe, expect, it } from "vitest";
import { cosineSimilarity, isEvidenceEligible, lexicalScore, requiresNarrativeFraming, shouldAbstain } from "@/lib/corpus/retrieval-policy";

describe("retrieval trust and relevance", () => {
  it("retrieves exact names lexically and concepts semantically", () => {
    expect(lexicalScore("Shunahshepa", "Vishvamitra protects Shunahshepa in the passage.")).toBeGreaterThan(0);
    expect(cosineSimilarity([1, 1, 0], [0.9, 0.8, 0.1])).toBeGreaterThan(cosineSimilarity([1, 1, 0], [0, 0, 1]));
  });

  it("excludes rejected and candidate knowledge", () => {
    expect(isEvidenceEligible({ kind: "passage", sourceStatus: "rejected" })).toBe(false);
    expect(isEvidenceEligible({ kind: "claim", reviewStatus: "rejected" })).toBe(false);
    expect(isEvidenceEligible({ kind: "candidate", reviewStatus: "approved" })).toBe(false);
    expect(isEvidenceEligible({ kind: "claim", reviewStatus: "approved" })).toBe(true);
    expect(isEvidenceEligible({ kind: "passage", sourceStatus: "approved" })).toBe(true);
  });

  it("abstains without evidence and requires narrative framing", () => {
    expect(shouldAbstain(0)).toBe(true);
    expect(requiresNarrativeFraming("Ramayana — Bala Kanda narrative")).toBe(true);
    expect(requiresNarrativeFraming("Rigveda Mandala 3")).toBe(false);
  });
});
