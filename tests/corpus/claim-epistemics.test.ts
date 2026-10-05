import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { classifyClaim, type ClassificationInput } from "@/lib/claim-epistemics/classification";
import { evaluateContract, evaluateUnresolved } from "@/lib/claim-epistemics/contracts";
import { contractStats, contractSufficient, inMetricScope, type ClaimEpistemicState } from "@/lib/claim-epistemics/evaluation";
import { epistemicSafeguard, evidenceDescription, framedStatement, packetTag } from "@/lib/claim-epistemics/language";
import { sourceClassOf, type ContractEvidence } from "@/lib/claim-epistemics/types";
import { evaluateDepth, type DepthParameter } from "@/lib/live-research/depth";
import { buildBoundedContext } from "@/lib/corpus/context";
import type { RetrievedClaim } from "@/lib/corpus/types";

const primaryExact: ContractEvidence = { level: "EXACT", sourceClass: "PRIMARY_TEXT", workKey: "chronicle" };
const scholarlyExact: ContractEvidence = { level: "EXACT", sourceClass: "SCHOLARLY", workKey: "journal-a" };
const scholarlyStrong: ContractEvidence = { level: "STRONG", sourceClass: "SCHOLARLY", workKey: "journal-a" };
const classify = (text: string, extra: Partial<ClassificationInput> = {}) => classifyClaim({ text, sourceClasses: ["PRIMARY_TEXT"], locators: ["2.4"], ...extra });

describe("evidence contracts by claim type", () => {
  it("1. a direct primary-text textual assertion is satisfied by one exact passage", () => {
    expect(evaluateContract("TEXTUAL_ASSERTION", [primaryExact])).toMatchObject({ satisfied: true, basis: "text" });
    expect(classify("The chronicle names the river crossing in verse 4.", { evidenceType: "direct_primary_text" }).type).toBe("TEXTUAL_ASSERTION");
  });

  it("2. traditional narrative is satisfied as tradition and never becomes historical fact", () => {
    expect(evaluateContract("TRADITIONAL_NARRATIVE", [primaryExact])).toMatchObject({ satisfied: true, basis: "tradition" });
    expect(evaluateContract("HISTORICAL_FACT", [primaryExact])).toMatchObject({ satisfied: false, status: "INSUFFICIENT_FOR_HISTORICAL_CLAIM" });
  });

  it("3. a direct scholarly attribution can be satisfied", () => {
    expect(evaluateContract("SCHOLARLY_ATTRIBUTION", [scholarlyExact])).toMatchObject({ satisfied: true, basis: "attribution" });
    expect(classify("Professor Rao argues that the river hymn records a tribal migration.", { sourceClasses: ["SCHOLARLY"], locators: ["p. 12"] }).type).toBe("SCHOLARLY_ATTRIBUTION");
  });

  it("4. scholarly interpretation stays interpretation, satisfied without primary proof", () => {
    expect(evaluateContract("SCHOLARLY_INTERPRETATION", [scholarlyStrong])).toMatchObject({ satisfied: true, basis: "interpretation" });
    expect(evaluateContract("SCHOLARLY_INTERPRETATION", [primaryExact]).satisfied).toBe(false);
  });

  it("5. synthetic interpretation needs substantial support in two independent works", () => {
    const strong = (workKey: string): ContractEvidence => ({ level: "STRONG", sourceClass: "PRIMARY_TEXT", workKey });
    expect(evaluateContract("SYNTHETIC_INTERPRETATION", [strong("a"), strong("a")]).satisfied).toBe(false);
    expect(evaluateContract("SYNTHETIC_INTERPRETATION", [strong("a"), strong("b")])).toMatchObject({ satisfied: true, basis: "synthesis" });
  });

  it("6. a historical fact requires independent historical/scholarly corroboration", () => {
    expect(evaluateContract("HISTORICAL_FACT", [scholarlyStrong]).satisfied).toBe(false);
    expect(evaluateContract("HISTORICAL_FACT", [scholarlyStrong, { level: "STRONG", sourceClass: "SCHOLARLY", workKey: "journal-b" }])).toMatchObject({ satisfied: true, basis: "fact" });
  });

  it("7. a contested claim is met by represented disagreement, not by one winning source", () => {
    expect(evaluateContract("CONTESTED", [{ level: "STRONG", sourceClass: "PRIMARY_TEXT", workKey: "a" }]).satisfied).toBe(false);
    expect(evaluateContract("CONTESTED", [{ level: "STRONG", sourceClass: "PRIMARY_TEXT", workKey: "a" }], { conflictSupported: true }).status).toBe("CONTESTED_REPRESENTED");
    expect(classify("Whether the two figures are the same person remains uncertain.").type).toBe("CONTESTED");
  });

  it("8. modern reception is supported by a modern source", () => {
    expect(evaluateContract("MODERN_RECEPTION", [{ level: "STRONG", sourceClass: "MODERN_COMMENTARY", workKey: "essay" }])).toMatchObject({ satisfied: true, basis: "reception" });
    expect(sourceClassOf({ source_type: "scholarly_book", textual_layer: "Modern spiritual interpretation" })).toBe("MODERN_COMMENTARY");
  });

  it("9. normative relevance cannot masquerade as ancient fact", () => {
    expect(evaluateContract("NORMATIVE_RELEVANCE", [primaryExact]).satisfied).toBe(false);
    expect(classify("The episode can support reflection on responsible leadership for modern readers today.").type).toBe("NORMATIVE_RELEVANCE");
  });
});

describe("classification", () => {
  it("10. compound status is independent of epistemic type", () => {
    const result = classify("The chronicle narrates the siege; the narrative also tells of the treaty that followed.", { evidenceType: "traditional_narrative" });
    expect(result.type).toBe("TRADITIONAL_NARRATIVE");
    expect(result.compound).toBe(true);
  });

  it("11. low-confidence types require review, and an unresolved type is met only if met under every plausible type", () => {
    const ambiguous = classify("The chronicle describes the founder as a figure of reform across the later accounts.", { evidenceType: "uncertain" });
    expect(ambiguous.needsReview).toBe(true);
    expect(evaluateUnresolved(["TRADITIONAL_NARRATIVE", "HISTORICAL_FACT"], [primaryExact])).toMatchObject({ satisfied: false, typeDependent: true });
    expect(evaluateUnresolved(["TRADITIONAL_NARRATIVE", "TEXTUAL_ASSERTION"], [primaryExact])).toMatchObject({ satisfied: true, typeDependent: false });
    expect(evaluateContract(null, [primaryExact]).status).toBe("NEEDS_TYPE_REVIEW");
  });

  it("never auto-types an interpretive claim as a direct-evidence claim", () => {
    const result = classify("The chronicle narrates the founder's journey, making him a symbol of civic courage.", { evidenceType: "traditional_narrative" });
    expect(result.type).toBe("TRADITIONAL_NARRATIVE");
    expect(result.needsReview).toBe(true);
  });

  it("does not let a method note leave coverage when it carries its own factual proposition", () => {
    const pure = classify("Such accounts should be stored as institutional memory and should not be presented as verified events.");
    expect(pure).toMatchObject({ type: "METHODOLOGICAL", needsReview: false });
    const mixed = classify("The founder appears in the earliest charter. These layers should remain distinct in the record and should not be converted into one biography.");
    expect(mixed.needsReview).toBe(true);
  });
});

describe("type-aware depth", () => {
  const base: DepthParameter = { code: "role", name: "Role", fieldCount: 4, fieldsWithSourceChunks: 4, sourceChunks: 12, independentWorks: 4, primaryWorks: 2, scholarlyWorks: 2,
    approvedClaims: 10, claimsWithExactPassages: 6, textualLayers: 2 };
  const state = (type: ClaimEpistemicState["type"], satisfied: boolean, status: ClaimEpistemicState["status"] = satisfied ? "SUPPORTED" : "PARTIALLY_SUPPORTED"): ClaimEpistemicState =>
    ({ type, satisfied, status, needsTypeReview: false });

  it("12. testing-only AI-reviewed children are excluded from strict metrics but visible in test metrics", () => {
    const child = { approval_origin: "system_test_bulk", approval_metadata: { ai_reviewed: true, testing_only: true } };
    expect(inMetricScope(child, "strict")).toBe(false);
    expect(inMetricScope(child, "test")).toBe(true);
    expect(inMetricScope({ approval_origin: "system_test_bulk", approval_metadata: { testing_only: true } }, "strict")).toBe(true);
    expect(inMetricScope({ ...child, approval_metadata: { ...child.approval_metadata, human_confirmed: true } }, "strict")).toBe(true);
  });

  it("13. contract satisfaction differs from the exact-link count", () => {
    const stats = contractStats([
      { core: true, epistemic: state("SCHOLARLY_INTERPRETATION", true) }, // met with STRONG, no exact link
      { core: true, epistemic: state("HISTORICAL_FACT", false, "INSUFFICIENT_FOR_HISTORICAL_CLAIM") }, // has an exact narrative link, contract unmet
    ]);
    expect(stats).toMatchObject({ satisfied: 1, evidentiary: 2, coreHistoricalNarrativeOnly: 1 });
  });

  it("14. type-aware depth does not inflate weak evidence", () => {
    const weak = contractStats(Array.from({ length: 10 }, (_, index) => ({ core: true, epistemic: state("SYNTHETIC_INTERPRETATION", index < 3) })));
    expect(evaluateDepth([{ ...base, contract: weak }]).areas[0].state).not.toBe("GOOD");
  });

  it("15. a parameter may reach GOOD although its interpretive claims have no exact passage", () => {
    const claims = [
      ...Array.from({ length: 8 }, () => ({ core: true, epistemic: state("TRADITIONAL_NARRATIVE", true) })),
      ...Array.from({ length: 2 }, () => ({ core: false, epistemic: state("SYNTHETIC_INTERPRETATION", true) })),
    ];
    const area = evaluateDepth([{ ...base, claimsWithExactPassages: 8, contract: contractStats(claims) }]).areas[0];
    expect(["GOOD", "DEEP"]).toContain(area.state);
    expect(area.explanation.join(" ")).toContain("8/8 traditional narrative claims have an exact passage");
  });

  it("16. a parameter cannot reach GOOD by relabeling unsupported claims", () => {
    const relabeled = contractStats(Array.from({ length: 10 }, (_, index) => ({ core: true,
      epistemic: index < 5 ? state("TRADITIONAL_NARRATIVE", true) : state("SYNTHETIC_INTERPRETATION", false, "UNSUPPORTED") })));
    expect(contractSufficient(relabeled).ok).toBe(false);
    const methodHeavy = contractStats([...Array.from({ length: 6 }, () => ({ core: true, epistemic: state("TRADITIONAL_NARRATIVE", true) })),
      ...Array.from({ length: 4 }, () => ({ core: true, epistemic: { type: "METHODOLOGICAL" as const, satisfied: null, status: "NOT_EVIDENTIARY" as const, needsTypeReview: false } }))]);
    expect(contractSufficient(methodHeavy).reasons).toContain("Too many claims are method notes rather than evidence about the subject");
  });
});

describe("answers use epistemic language", () => {
  const claim = (epistemicType: string, text: string, extra: Partial<RetrievedClaim> = {}): RetrievedClaim => ({ kind: "claim", id: `claim:${text.length}`, claimId: String(text.length), text,
    claimKind: "x", certainty: "high", approvalOrigin: "system_test_bulk", evidenceType: "uncertain", epistemicType, contractStatus: "SUPPORTED", parameterName: "Role", fieldLabel: null,
    sourceTitle: "Chronicle", sourceAuthor: null, sourceInstitution: null, sourceUrl: null, sourceType: "primary_text", pageOrSection: "2.4", evidenceExcerpt: null, chunkId: null,
    textualLayer: "Founding Chronicle — Book 2", ...extra });

  it("17. extractive phrasing frames narrative, inference, attribution, and contested evidence naturally", () => {
    expect(framedStatement(claim("TRADITIONAL_NARRATIVE", "The founder crossed the river at night."))).toBe("In the Founding Chronicle narrative, the founder crossed the river at night.");
    expect(framedStatement(claim("HISTORICAL_INFERENCE", "The crossing reflects an early migration."))).toBe("The evidence suggests, without establishing, that the crossing reflects an early migration.");
    expect(framedStatement(claim("SCHOLARLY_ATTRIBUTION", "Professor Rao argues that the crossing was real."))).toBe("Professor Rao argues that the crossing was real.");
    expect(framedStatement(claim("HISTORICAL_FACT", "The founder lived in the fifth century.", { contractStatus: "INSUFFICIENT_FOR_HISTORICAL_CLAIM" })))
      .toBe("The founder lived in the fifth century. The available evidence does not establish this historically.");
    expect(evidenceDescription(claim("TRADITIONAL_NARRATIVE", "x"))).toBe("What the Founding Chronicle narrative tells; not independent historical evidence");
    expect(framedStatement(claim("TRADITIONAL_NARRATIVE", "x")).includes("EPISTEMIC")).toBe(false);
    const guarded = epistemicSafeguard("The crossing is historically verified [C1].", [claim("TRADITIONAL_NARRATIVE", "The founder crossed the river.")]);
    expect(guarded.notes).toHaveLength(1);
    expect(epistemicSafeguard("The identity remains debated [C1].", [claim("CONTESTED", "Whether the two figures are one is uncertain.")]).notes).toEqual([]);
  });

  it("18. the synthesis packet carries a compact epistemic tag per claim", () => {
    const { context } = buildBoundedContext([claim("TRADITIONAL_NARRATIVE", "The founder crossed the river at night.")]);
    expect(context).toContain("Epistemic: TRADITIONAL_NARRATIVE");
    expect(context).toContain("support: SUPPORTED");
    expect(packetTag(claim("HISTORICAL_FACT", "x", { contractStatus: "INSUFFICIENT_FOR_HISTORICAL_CLAIM" }))).toBe("historical fact · narrative only, not historical proof");
  });
});

describe("generic operation", () => {
  it("19. a scientist fixture is judged by the same engine with different treatment per claim", () => {
    const article: ContractEvidence = { level: "EXACT", sourceClass: "SCHOLARLY", workKey: "doi:10.5555/fixture" };
    const reported = classify("Ada Example reported the damping anomaly in her 1931 article.", { sourceClasses: ["SCHOLARLY"], locators: ["p. 214"] });
    const later = classify("Later researchers interpreted the anomaly as evidence of superfluidity.", { sourceClasses: ["SCHOLARLY"], locators: ["p. 9"] });
    const broad = classify("The anomaly historically proves that all quantum fluids behave alike.", { sourceClasses: ["SCHOLARLY"], locators: ["p. 214"] });
    expect(reported.type).not.toBe(broad.type);
    expect(later.type).toBe("SCHOLARLY_INTERPRETATION");
    expect(broad.type).toBe("HISTORICAL_FACT");
    expect(evaluateContract(broad.type, [article]).satisfied).toBe(false);
    expect(evaluateContract("SCHOLARLY_INTERPRETATION", [article]).satisfied).toBe(true);
  });

  it("20. the epistemics module contains no personality, tradition, or work names", () => {
    const dir = path.join(process.cwd(), "src/lib/claim-epistemics");
    const code = readdirSync(dir).map((name) => readFileSync(path.join(dir, name), "utf8")).join("\n");
    expect(code).not.toMatch(/vishvamitra|vasistha|ramayana|rigveda|mahabharata|bala kanda|aitareya|aurobindo/i);
  });
});
