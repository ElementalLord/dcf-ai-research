import { describe, expect, it, vi } from "vitest";
import { verifyDemandKnowledge } from "@/lib/live-research/knowledge-verification";
import type { OnDemandResearchResult, ResearchFinding } from "@/lib/live-research/on-demand-engine";
import type { EvidenceGapRequest } from "@/lib/ask/question-resolution";

const request = { needId: "need", personalityId: "00000000-0000-0000-0000-000000000001", personalityName: "Anika Sen",
  normalizedIntent: "date", category: "SPECIFIC", gaps: [], existingEvidenceIds: [], maxExternalSearches: 1 } as unknown as EvidenceGapRequest;
const proposition = "Anika Sen was awarded the Aurora Medal in 1928.";
function finding(patch: Partial<ResearchFinding> = {}): ResearchFinding {
  return { source: { url: "https://archive.example.edu/record", sourceId: null, publisherDomain: "archive.example.edu",
    retrievedAt: "2026-10-18T00:00:00Z", title: "Aurora Medal register", author: "Registrar", publisher: "Example Archive",
    publicationDate: "1928", journal: null, doi: null, isbn: null, evidenceType: "institutional_record", workKey: "work:medal-register", provenanceComplete: true },
    passage: { text: "The register records that Anika Sen was awarded the Aurora Medal in 1928.", locator: "Award register, 1928",
      supportLevel: "EXACT", supportReason: "Direct statement" }, relation: "supports", retention: "license_candidate",
    rightsDeclaration: "https://creativecommons.org/licenses/by/4.0/", citeableNow: true, verificationReady: true, ...patch };
}
function research(findings = [finding()]): OnDemandResearchResult {
  return { requestId: "request", needId: "need", workId: "work", status: "complete", attempted: true, candidates: [], findings,
    passages: [], unresolvedGaps: [], sufficientForVerification: true, citeableNow: true,
    usage: { searchCalls: 1, sourceFetches: findings.length, modelCalls: 0, provider: "fixture", errorCategory: null } };
}
function setup(options: { findings?: ResearchFinding[]; claim?: string; existing?: string[]; existingOrigin?: string; enabled?: boolean; assess?: Record<string, unknown>; failAssess?: boolean; failWrite?: boolean } = {}) {
  const findings = options.findings || [finding()];
  const claim = options.claim || proposition;
  const provider = {
    extract: vi.fn(async (): Promise<import("@/lib/live-research/knowledge-verification").AtomicCandidate[]> => [{ proposition: claim, type: "HISTORICAL_FACT", evidenceIndexes: findings.map((_, index) => index),
      context: null, period: "1928", qualification: null, category: "official_record_fact" }]),
    assess: vi.fn(async () => {
      if (options.failAssess) throw new Error("provider unavailable");
      return { support: "SUPPORTED" as const, supportingIndexes: findings.map((_, index) => index), equivalentExisting: false,
        conflictsExisting: false, materialContradiction: false, exactEntities: true, exactDatesAndUnits: true,
        qualifiersPreserved: true, officialIssuer: true, independentDocuments: true, reason: "Directly stated", ...options.assess };
    }),
  };
  const rows: Array<{ id: string; claim_text: string; approval_origin: string }> = (options.existing || []).map((claim_text, index) => ({ id: `old-${index}`, claim_text, approval_origin: options.existingOrigin || "corpus_evidence_review" }));
  const store = { existing: vi.fn(async () => rows), admit: vi.fn(async (input: Record<string, unknown>) => {
    if (options.failWrite) throw new Error("db failed");
    rows.push({ id: "new-claim", claim_text: String(input.claim_text), approval_origin: "automated_evidence_verification" });
    return { claimId: "new-claim", created: true };
  }), record: vi.fn(async () => {}) };
  return { findings, provider, store, enabled: options.enabled ?? true };
}

describe("demand knowledge verification", () => {
  it("admits a directly documented routine official date and reuses the stored claim", async () => {
    const deps = setup();
    const first = await verifyDemandKnowledge(request, research(deps.findings), deps);
    expect(first.decisions[0]).toMatchObject({ outcome: "admitted", support: "SUPPORTED", claimId: "new-claim" });
    expect(deps.store.admit).toHaveBeenCalledOnce();
    expect(deps.store.admit.mock.calls[0][0]).toMatchObject({ policy_version: "demand-admission/1", sources: [expect.objectContaining({ locator: "Award register, 1928" })] });
    const second = await verifyDemandKnowledge(request, research(deps.findings), deps);
    expect(second.decisions[0].outcome).toBe("duplicate");
    expect(deps.store.admit).toHaveBeenCalledOnce();
    expect(deps.provider.assess).toHaveBeenCalledOnce();
  });

  it.each([
    ["irrelevant passage", { assess: { support: "INSUFFICIENT_EVIDENCE" } }, "quarantined"],
    ["wrong entity", { assess: { exactEntities: false } }, "quarantined"],
    ["wrong units", { assess: { exactDatesAndUnits: false } }, "quarantined"],
    ["wrong year", { claim: "Anika Sen was awarded the Aurora Medal in 1929." }, "quarantined"],
    ["fabricated quote", { claim: 'Anika Sen said "I won" in 1928.' }, "quarantined"],
    ["contradictory source", { assess: { support: "CONTRADICTED" } }, "rejected"],
    ["corpus conflict", { assess: { conflictsExisting: true } }, "quarantined"],
    ["dependent documents", { assess: { independentDocuments: false }, findings: [finding(), finding({ source: { ...finding().source, url: "https://other.example.org/record", publisherDomain: "other.example.org", workKey: "work:other" } })] }, "quarantined"],
    ["provider failure", { failAssess: true }, "quarantined"],
    ["database failure", { failWrite: true }, "quarantined"],
    ["rights restricted", { findings: [finding({ retention: "transient_only", rightsDeclaration: null })] }, "quarantined"],
    ["invalid provenance", { findings: [finding({ source: { ...finding().source, provenanceComplete: false } })] }, "quarantined"],
    ["uncertainty", { claim: "Anika Sen may have been awarded the Aurora Medal in 1928." }, "quarantined"],
    ["priority", { claim: "Anika Sen was first awarded the Aurora Medal in 1928." }, "quarantined"],
    ["shadow mode", { enabled: false }, "shadow"],
  ] as const)("%s remains safe", async (_name, options, outcome) => {
    const deps = setup({ ...options, findings: "findings" in options ? [...options.findings] : undefined });
    const result = await verifyDemandKnowledge(request, research(deps.findings), deps);
    expect(result.decisions[0]?.outcome).toBe(outcome);
    if (outcome !== "quarantined" || !("failWrite" in options)) expect(deps.store.admit).not.toHaveBeenCalled();
  });

  it("collapses mirrored works and requires corroboration for ordinary historical facts", async () => {
    const second = finding({ source: { ...finding().source, url: "https://mirror.example.org/register", publisherDomain: "mirror.example.org" } });
    const deps = setup({ findings: [finding(), second] });
    deps.provider.extract.mockResolvedValueOnce([{ proposition, type: "HISTORICAL_FACT", evidenceIndexes: [0, 1], context: null, period: "1928", qualification: null, category: "ordinary_fact" }]);
    const result = await verifyDemandKnowledge(request, research(deps.findings), deps);
    expect(result.decisions[0].outcome).toBe("quarantined");
    expect(deps.store.admit).not.toHaveBeenCalled();
  });

  it("accepts genuinely independent works for an ordinary historical fact", async () => {
    const second = finding({ source: { ...finding().source, url: "https://university.example.org/history", publisherDomain: "university.example.org",
      workKey: "work:independent-history", title: "An independent history", publisher: "University Press", evidenceType: "scholarly_interpretation" } });
    const deps = setup({ findings: [finding(), second] });
    deps.provider.extract.mockResolvedValueOnce([{ proposition, type: "HISTORICAL_FACT", evidenceIndexes: [0, 1], context: null, period: "1928", qualification: null, category: "ordinary_fact" }]);
    const result = await verifyDemandKnowledge(request, research(deps.findings), deps);
    expect(result.decisions[0].outcome).toBe("admitted");
  });

  it("deduplicates equivalent wording before another verifier call", async () => {
    const deps = setup({ existing: ["Anika Sen was awarded the Aurora Medal in 1928."] });
    const result = await verifyDemandKnowledge(request, research(deps.findings), deps);
    expect(result.decisions[0].outcome).toBe("duplicate");
    expect(deps.provider.assess).not.toHaveBeenCalled();
  });

  it("does not reuse an imported claim excluded by strict retrieval", async () => {
    const deps = setup({ existing: [proposition], existingOrigin: "imported_existing" });
    const result = await verifyDemandKnowledge(request, research(deps.findings), deps);
    expect(result.decisions[0].outcome).toBe("admitted");
    expect(deps.provider.assess).toHaveBeenCalledOnce();
    expect(deps.store.admit).toHaveBeenCalledOnce();
  });

  it("stores the supporting sentence when it occurs after character 240", async () => {
    const passage = `${"Archive context. ".repeat(18)}${proposition}`;
    const deps = setup({ findings: [finding({ passage: { ...finding().passage, text: passage } })] });
    const result = await verifyDemandKnowledge(request, research(deps.findings), deps);
    expect(result.decisions[0].outcome).toBe("admitted");
    const input = deps.store.admit.mock.calls[0][0] as { sources: Array<{ excerpt: string }> };
    expect(input.sources[0].excerpt).toContain(proposition);
    expect(input.sources[0].excerpt.length).toBeLessThanOrEqual(240);
  });

  it("refuses a title-like line even if an upstream model calls it supported", async () => {
    const title = "Anika Sen Aurora Medal 1928";
    const deps = setup({ findings: [finding({ passage: { text: title, locator: "Award register",
      supportLevel: "EXACT", supportReason: "Incorrect upstream title rating" } })] });
    const result = await verifyDemandKnowledge(request, research(deps.findings), deps);
    expect(result.decisions[0].outcome).toBe("quarantined");
    expect(deps.store.admit).not.toHaveBeenCalled();
  });

  it("quarantines a competing date in the approved corpus", async () => {
    const deps = setup({ existing: ["Anika Sen was awarded the Aurora Medal in 1927."] });
    const result = await verifyDemandKnowledge(request, research(deps.findings), deps);
    expect(result.decisions[0].outcome).toBe("quarantined");
    expect(deps.provider.assess).not.toHaveBeenCalled();
  });

  it.each([
    ["TRADITIONAL_NARRATIVE", "tradition"],
    ["SCHOLARLY_INTERPRETATION", "interpretation"],
    ["CONTEMPORARY_OBSERVATION", "statistic"],
    ["SCIENTIFIC_PRIORITY", "priority"],
    ["CAUSAL_SIGNIFICANCE", "interpretation"],
  ] as const)("never promotes %s as an uncontested fact", async (type, category) => {
    const deps = setup();
    deps.provider.extract.mockResolvedValueOnce([{ proposition, type, evidenceIndexes: [0], context: null,
      period: "1928", qualification: null, category }]);
    const result = await verifyDemandKnowledge(request, research(deps.findings), deps);
    expect(result.decisions[0].outcome).toBe("quarantined");
    expect(deps.store.admit).not.toHaveBeenCalled();
  });

  it("reports a concurrent admission as duplicate", async () => {
    const deps = setup();
    deps.store.admit.mockResolvedValueOnce({ claimId: "other-request", created: false });
    const result = await verifyDemandKnowledge(request, research(deps.findings), deps);
    expect(result.decisions[0]).toMatchObject({ outcome: "duplicate", claimId: "other-request" });
  });

  it("does no verification without a question-triggered research attempt", async () => {
    const deps = setup();
    const result = await verifyDemandKnowledge(request, { ...research(), attempted: false }, deps);
    expect(result.decisions).toEqual([]);
    expect(deps.provider.extract).not.toHaveBeenCalled();
  });
});
