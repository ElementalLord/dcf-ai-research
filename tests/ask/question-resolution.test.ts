import { describe, expect, it } from "vitest";
import { resolveQuestion, type ResolutionInput } from "@/lib/ask/question-resolution";
import type { RetrievedClaim, RetrievedPassage } from "@/lib/corpus/types";

const personId = "00000000-0000-4000-8000-000000000001";
const passage = (text: string, extra: Partial<RetrievedPassage> = {}): RetrievedPassage => ({
  kind: "passage", id: "passage:one", chunkId: "one", sourceId: "source-one", text,
  sectionTitle: null, pageOrSection: "p. 4", textualLayer: null, sourceTitle: "University history",
  sourceAuthor: null, sourceInstitution: "University", sourceUrl: null, sourceType: "institutional_record",
  sourceStatus: "approved", personalityId: personId, personalityName: "Anika Sen", origin: "permanent", lexicalScore: 1,
  ...extra,
});
const claim = (text: string, extra: Partial<RetrievedClaim> = {}): RetrievedClaim => ({
  kind: "claim", id: "claim:one", claimId: "one", text, claimKind: "fact", certainty: "high",
  approvalOrigin: "mentor_review", reviewStatus: "approved", evidenceType: "institutional_record",
  epistemicType: "HISTORICAL_FACT", contractStatus: "SUPPORTED", personalityId: personId,
  personalityName: "Anika Sen", parameterName: null, fieldLabel: null, sourceTitle: "University history",
  sourceAuthor: null, sourceInstitution: "University", sourceUrl: null, sourceType: "institutional_record",
  pageOrSection: "p. 4", evidenceExcerpt: null, chunkId: null, textualLayer: null, ...extra,
});
const input = (question: string, evidence: ResolutionInput["evidence"], extra: Partial<ResolutionInput> = {}): ResolutionInput => ({
  question, evidence, personalityId: personId, personalityName: "Anika Sen", personalityAliases: ["Anika Sen"],
  termAliases: [], allParameters: [], policyMode: "strict", researchAvailable: true, now: new Date("2026-10-18"), ...extra,
});

describe("local-first question resolution", () => {
  it("searches for the requested work when local evidence only names the venue", () => {
    const question = "What did Anika Sen perform at the United Nations?";
    const venue = passage("Anika Sen gave a performance at the United Nations.");
    const result = resolveQuestion(input(question, [venue]));
    expect(result.researchJustified).toBe(true);
    expect(result.gaps.some((gap) => gap.requirementKey === "requested_work")).toBe(true);
    const specific = resolveQuestion(input(question, [passage("Anika Sen performed the song Maithreem Bhajata at the United Nations.")]));
    expect(specific.gaps.some((gap) => gap.requirementKey === "requested_work")).toBe(false);
  });
  it("reuses committed machine-verified knowledge locally and excludes it after suspension", () => {
    const question = "When was Anika Sen awarded the Aurora Medal?";
    const admitted = claim("Anika Sen was awarded the Aurora Medal in 1928.", {
      approvalOrigin: "automated_evidence_verification", chunkId: "verified-passage", sourceTitle: "Aurora Medal register",
    });
    const reused = resolveQuestion(input(question, [admitted]));
    expect(reused).toMatchObject({ route: "answer", researchRequest: null, researchJustified: false });
    const suspended = resolveQuestion(input(question, [{ ...admitted, reviewStatus: "needs_review" }]));
    expect(suspended.verifiedClaims).toHaveLength(0);
    expect(suspended.researchRequest).not.toBeNull();
  });
  it("routes a supported dated fact locally with no research request", () => {
    const result = resolveQuestion(input("When did Anika Sen discover the prism effect?", [passage("Anika Sen discovered the prism effect in 1928.")]));
    expect(result).toMatchObject({ route: "answer", state: "local_sufficient", researchJustified: false, researchRequest: null });
  });

  it("reuses a verified date for a what-year paraphrase without demanding period context", () => {
    const result = resolveQuestion(input("What year did Anika Sen discover the prism effect?", [passage("Anika Sen discovered the prism effect in 1928.")]));
    expect(result).toMatchObject({ state: "local_sufficient", researchRequest: null });
  });

  it("describes only the missing significance when a contribution is supported", () => {
    const result = resolveQuestion(input("What did Anika Sen discover and why was the prism effect important?", [claim("Anika Sen discovered the prism effect in 1928.")]));
    expect(result.route).toBe("research");
    expect(result.gaps.some((gap) => gap.type === "scholarly_interpretation")).toBe(true);
    expect(result.gaps.some((gap) => gap.requirement.includes("specific contribution"))).toBe(false);
    expect(result.researchRequest?.maxExternalSearches).toBe(1);
  });

  it("requests research for genuinely missing information", () => {
    const result = resolveQuestion(input("When did Anika Sen discover the prism effect?", []));
    expect(result).toMatchObject({ route: "research", state: "research_required" });
    expect(result.gaps.some((gap) => gap.type === "chronology")).toBe(true);
  });

  it("reuses the same need for date paraphrases while separating significance", () => {
    const first = resolveQuestion(input("When did Anika Sen discover the prism effect?", []));
    const paraphrase = resolveQuestion(input("What year was the prism effect discovered by Anika Sen?", []));
    const other = resolveQuestion(input("Why was the prism effect important?", []));
    expect(first.needId).toBe(paraphrase.needId);
    expect(first.needId).not.toBe(other.needId);
  });

  it("does not elevate drafts, another personality's record, or failed contracts", () => {
    const question = "When did Anika Sen discover the prism effect?";
    for (const item of [claim("Anika Sen discovered the prism effect in 1928.", { reviewStatus: "draft" }),
      claim("Anika Sen discovered the prism effect in 1928.", { personalityId: "other" }),
      claim("Anika Sen discovered the prism effect in 1928.", { contractStatus: "UNSUPPORTED" })]) {
      const result = resolveQuestion(input(question, [item]));
      expect(result.sufficient).toBe(false);
      expect(result.verifiedClaims).toHaveLength(0);
    }
  });

  it("keeps traditional narratives separate from historical proof", () => {
    const result = resolveQuestion(input("When did Anika Sen discover the prism effect?", [claim("A tradition says Anika Sen discovered the prism effect in 1928.", {
      epistemicType: "TRADITIONAL_NARRATIVE", contractStatus: "INSUFFICIENT_FOR_HISTORICAL_CLAIM",
    })]));
    expect(result.sufficient).toBe(false);
  });

  it("requires independent representation for a contested claim", () => {
    const result = resolveQuestion(input("Was Anika Sen first to discover the prism effect?", [
      claim("Anika Sen discovered the prism effect first.", { epistemicType: "CONTESTED", contractStatus: "CONTESTED_REPRESENTED" }),
    ]));
    expect(result.sufficient).toBe(false);
    expect(result.gaps.some((gap) => gap.type === "contested_claim" && gap.contested)).toBe(true);
  });

  it("does not count an expired cached passage as local evidence", () => {
    const result = resolveQuestion(input("When did Anika Sen discover the prism effect?", [passage("Anika Sen discovered the prism effect in 1928.", {
      origin: "live_cache", cacheExpiresAt: "2025-01-01T00:00:00Z",
    })]));
    expect(result.verifiedPassages).toHaveLength(0);
    expect(result.sufficient).toBe(false);
  });

  it("uses live research when local retrieval is incomplete", () => {
    const result = resolveQuestion(input("When did Anika Sen discover the prism effect?", [], { retrievalErrors: ["database unavailable"] }));
    expect(result).toMatchObject({ state: "research_required", route: "research", researchJustified: true });
    expect(result.researchRequest).not.toBeNull();
  });

  it("declines or partially answers when research is unavailable", () => {
    const result = resolveQuestion(input("When did Anika Sen discover the prism effect?", [], { researchAvailable: false }));
    expect(result).toMatchObject({ route: "decline", state: "research_unavailable" });
  });
});
