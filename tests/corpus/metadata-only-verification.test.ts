import { describe, expect, it, vi } from "vitest";
import { verifyDemandKnowledge, type AtomicCandidate } from "@/lib/live-research/knowledge-verification";
import type { EvidenceGapRequest } from "@/lib/ask/question-resolution";
import type { OnDemandResearchResult, ResearchFinding } from "@/lib/live-research/on-demand-engine";

const request = { personalityId: "00000000-0000-0000-0000-000000000001", personalityName: "Mira Rao" } as EvidenceGapRequest;
const claim = "Mira Rao was awarded the Meridian Medal in 1931.";
const original = "The 1931 register awarded Mira Rao its Meridian Medal.";
const finding = (url = "https://records.example.edu/medal", passage = original): ResearchFinding => ({
  source: { url, sourceId: null, publisherDomain: new URL(url).hostname, retrievedAt: new Date().toISOString(),
    title: "Meridian Medal register", author: "Registrar", publisher: "Example Institute Records",
    publicationDate: "1931", journal: null, doi: null, isbn: null, evidenceType: "institutional_record",
    workKey: `register:${url}`, provenanceComplete: true },
  passage: { text: passage, locator: "Register entry 1931", supportLevel: "EXACT", supportReason: "Direct date" },
  relation: "supports", retention: "transient_only", rightsDeclaration: null, citeableNow: true, verificationReady: false,
});
const research = (findings: ResearchFinding[]): OnDemandResearchResult => ({ requestId: "fixture", needId: "fixture", workId: "fixture",
  status: "complete", attempted: true, candidates: [], findings, passages: [], unresolvedGaps: [],
  sufficientForVerification: false, citeableNow: true,
  usage: { searchCalls: 1, sourceFetches: findings.length, modelCalls: 0, provider: "fixture", errorCategory: null } });
const candidate = (): AtomicCandidate => ({ proposition: claim, type: "HISTORICAL_FACT", evidenceIndexes: [0],
  context: null, period: "1931", qualification: null, category: "official_record_fact" });
function deps(permission = true, assessment: Record<string, unknown> = {}) {
  const provider = { extract: vi.fn(async () => [candidate()]), assess: vi.fn(async () => ({
    support: "SUPPORTED" as const, supportingIndexes: [0], equivalentExisting: false, conflictsExisting: false,
    materialContradiction: false, exactEntities: true, exactDatesAndUnits: true, qualifiersPreserved: true,
    officialIssuer: true, independentDocuments: true, reason: "Directly supported", ...assessment })) };
  const store = { existing: vi.fn(async () => []),
    admit: vi.fn(async (input: Record<string, unknown>) => { void input; return { claimId: "licensed", created: true }; }),
    admitMetadata: vi.fn(async (input: Record<string, unknown>) => { void input; return { claimId: "metadata", created: true }; }),
    metadataPermission: vi.fn(async () => permission), record: vi.fn(async () => {}) };
  return { provider, store, enabled: true };
}

describe("metadata-only verifier", () => {
  it("passes transient original text to verification but writes only reviewed bibliographic metadata", async () => {
    const setup = deps();
    const result = await verifyDemandKnowledge(request, research([finding()]), setup);
    expect(result.decisions[0], JSON.stringify(result.decisions[0])).toMatchObject({ outcome: "admitted", claimId: "metadata" });
    expect(setup.provider.assess).toHaveBeenCalledOnce();
    expect(setup.store.admit).not.toHaveBeenCalled();
    const payload = setup.store.admitMetadata.mock.calls[0]?.[0] as unknown as Record<string, unknown>;
    expect(payload).toMatchObject({ storage_mode: "metadata_only", sources: [expect.objectContaining({
      url: "https://records.example.edu/medal", locator: "Register entry 1931" })] });
    expect(JSON.stringify(payload)).not.toContain(original);
    expect(JSON.stringify(payload)).not.toContain("excerpt");
  });

  it("rejects uncertain access terms before a model call", async () => {
    const setup = deps(false);
    const result = await verifyDemandKnowledge(request, research([finding()]), setup);
    expect(result.decisions[0].outcome).toBe("quarantined");
    expect(setup.provider.extract).not.toHaveBeenCalled();
    expect(setup.store.admitMetadata).not.toHaveBeenCalled();
  });

  it("rejects contradictory or inaccurate evidence", async () => {
    const contradiction = deps(true, { support: "CONTRADICTED", materialContradiction: true });
    const result = await verifyDemandKnowledge(request, research([finding()]), contradiction);
    expect(result.decisions[0].outcome).not.toBe("admitted");
    expect(contradiction.store.admitMetadata).not.toHaveBeenCalled();
    const inaccurate = deps(true, { exactDatesAndUnits: false });
    const second = await verifyDemandKnowledge(request, research([finding()]), inaccurate);
    expect(second.decisions[0].outcome).toBe("quarantined");
    const flagged = deps();
    const conflict = finding("https://independent.example.org/medal");
    conflict.relation = "potential_contradiction";
    const third = await verifyDemandKnowledge(request, research([finding(), conflict]), flagged);
    expect(third.decisions[0].outcome).toBe("quarantined");
    expect(flagged.provider.extract).not.toHaveBeenCalled();
  });

  it("requires independent works and publishers for an ordinary historical fact", async () => {
    const first = finding();
    const second = finding("https://university.example.org/medal");
    second.source.publisher = "Example University Press";
    const setup = deps();
    setup.provider.extract.mockResolvedValueOnce([{ ...candidate(), evidenceIndexes: [0, 1], category: "ordinary_fact" }]);
    setup.provider.assess.mockResolvedValueOnce({ support: "SUPPORTED", supportingIndexes: [0, 1],
      equivalentExisting: false, conflictsExisting: false, materialContradiction: false,
      exactEntities: true, exactDatesAndUnits: true, qualifiersPreserved: true,
      officialIssuer: false, independentDocuments: true, reason: "Independent records" });
    expect((await verifyDemandKnowledge(request, research([first, second]), setup)).decisions[0].outcome).toBe("admitted");
    const dependent = deps();
    const mirror = finding("https://records.example.edu/mirror");
    mirror.source.workKey = "separate-looking-work";
    dependent.provider.extract.mockResolvedValueOnce([{ ...candidate(), evidenceIndexes: [0, 1], category: "ordinary_fact" }]);
    expect((await verifyDemandKnowledge(request, research([first, mirror]), dependent)).decisions[0].outcome).toBe("quarantined");
    expect(dependent.store.admitMetadata).not.toHaveBeenCalled();
  });

  it("rejects copied source wording", async () => {
    const setup = deps();
    setup.provider.extract.mockResolvedValueOnce([{ ...candidate(), proposition: original }]);
    const result = await verifyDemandKnowledge(request, research([finding()]), setup);
    expect(result.decisions[0].outcome).toBe("quarantined");
    expect(setup.store.admitMetadata).not.toHaveBeenCalled();
  });

  it("does not persist model explanations containing transient source text", async () => {
    const setup = deps(true, { support: "INSUFFICIENT_EVIDENCE", reason: original });
    await verifyDemandKnowledge(request, research([finding()]), setup);
    expect(setup.store.record).toHaveBeenCalledOnce();
    expect(JSON.stringify(setup.store.record.mock.calls)).not.toContain(original);
  });
});
