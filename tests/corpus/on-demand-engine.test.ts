import { describe, expect, it } from "vitest";
import { executeDemandResearch, type FetchedExcerpt, type ResearchDependencies } from "@/lib/live-research/on-demand-engine";
import type { EvidenceGapRequest } from "@/lib/ask/question-resolution";
import type { RetrievedEvidence } from "@/lib/corpus/types";
import { authenticateSource } from "@/lib/live-research/research-quality";

const id = "00000000-0000-4000-8000-000000000001";
const request: EvidenceGapRequest = {
  needId: "a".repeat(64), personalityId: id, personalityName: "Anika Sen", normalizedIntent: "date:prism effect",
  category: "NARROW_FACT", existingEvidenceIds: [], maxExternalSearches: 1,
  gaps: [{ id: "b".repeat(64), requirementKey: "date", type: "chronology", subjectId: id, topic: "prism effect",
    requirement: "A dated original account of the prism effect", suitableSources: ["dated primary record"],
    completion: "An original document explicitly dates the discovery.", contested: false }],
};
const url = "https://university.example.org/history/prism";
const excerpt = (overrides: Partial<FetchedExcerpt> = {}): FetchedExcerpt => ({
  text: "Anika Sen discovered the prism effect in 1928.", title: "History of the prism effect", url,
  locator: "p. 12", supportLevel: "EXACT", supportReason: "The original passage names the date and person.",
  identity: authenticateSource({ url, title: "History of the prism effect", author: "M. Rao", publisher: "University",
    publicationDate: "2001", doi: "10.1234/prism" }), rightsDeclaration: "https://creativecommons.org/licenses/by/4.0/", ...overrides,
});
function fixture(results = [{ title: "History of the prism effect", url, sourceProvider: "mock" }]) {
  const calls: string[] = [];
  const deps: ResearchDependencies = {
    provider: { name: "mock", isConfigured: () => true, async search(query) { calls.push(query); return results; } },
    async claimNeed() { return "acquired"; }, async finishNeed() {},
    async inspect(candidate) { return { url: candidate, domain: new URL(candidate).hostname, category: "scholarly", title: "History of the prism effect" }; },
    async robotsAllowed() { return true; }, async read() { return excerpt(); }, async existingSourceId() { return null; },
    now: () => new Date("2026-10-18T00:00:00Z"),
  };
  return { deps, calls };
}

describe("bounded on-demand research", () => {
  it("does not search a need with no gaps", async () => {
    const { deps, calls } = fixture();
    const result = await executeDemandResearch({ ...request, gaps: [] }, "When was the prism effect discovered?", [], ["Anika Sen"], deps);
    expect(result.attempted).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("uses exactly one narrow search and returns traceable original-source evidence", async () => {
    const { deps, calls } = fixture();
    const result = await executeDemandResearch(request, "When did Anika Sen discover the prism effect?", [], ["Anika Sen"], deps);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("prism effect");
    expect(result).toMatchObject({ status: "complete", citeableNow: true, sufficientForVerification: true, usage: { searchCalls: 1, modelCalls: 0 } });
    expect(result.findings[0]).toMatchObject({ passage: { locator: "p. 12" }, source: { doi: "10.1234/prism" }, retention: "license_candidate" });
    expect(result.passages[0]).toMatchObject({ origin: "brave_live", sourceStatus: "discovered", pageOrSection: "p. 12" });
    expect(result).not.toHaveProperty("claims");
  });

  it("rejects a reputable but irrelevant source", async () => {
    const { deps } = fixture();
    const finish = async (...args: Parameters<ResearchDependencies["finishNeed"]>) => { expect(args[2]).toBe("insufficient"); expect(args[5]).toBe(600); };
    deps.finishNeed = finish;
    deps.read = async () => null;
    const result = await executeDemandResearch(request, "When was the prism effect discovered?", [], ["Anika Sen"], deps);
    expect(result).toMatchObject({ status: "insufficient", citeableNow: false });
    expect(result.candidates[0].decision).toBe("irrelevant");
  });

  it("deduplicates mirrors of the same DOI and does not count them as independent findings", async () => {
    const mirror = "https://repository.example.edu/prism-paper";
    const { deps } = fixture([{ title: "A paper", url, sourceProvider: "mock" }, { title: "Repository copy", url: mirror, sourceProvider: "mock" }]);
    deps.read = async (source) => excerpt({ url: source.url });
    const result = await executeDemandResearch({ ...request, gaps: [{ ...request.gaps[0], requirementKey: "contested", type: "contested_claim" }] },
      "Was the prism effect first?", [], ["Anika Sen"], deps);
    expect(result.findings).toHaveLength(1);
    expect(result.candidates.some((candidate) => candidate.decision === "duplicate_work")).toBe(true);
    expect(result.status).toBe("insufficient");
  });

  it("flags a potential contradiction and withholds verification readiness", async () => {
    const { deps } = fixture();
    deps.read = async () => excerpt({ text: "Anika Sen did not discover the prism effect in 1928." });
    const existing: RetrievedEvidence[] = [{ kind: "passage", id: "old", chunkId: "old", sourceId: "old", text: "Anika Sen discovered the prism effect in 1928.",
      sectionTitle: null, pageOrSection: null, textualLayer: null, sourceTitle: "Archive", sourceAuthor: null,
      sourceInstitution: null, sourceUrl: null, sourceType: null, sourceStatus: "approved", personalityId: id }];
    const result = await executeDemandResearch(request, "When did Anika Sen discover the prism effect?", existing, ["Anika Sen"], deps);
    expect(result.findings[0].relation).toBe("potential_contradiction");
    expect(result.status).toBe("insufficient");
    expect(result.unresolvedGaps.some((gap) => gap.type === "conflicting_evidence")).toBe(true);
    expect(result.sufficientForVerification).toBe(false);
  });

  it("keeps rights-uncertain passages transient", async () => {
    const { deps } = fixture();
    deps.read = async () => excerpt({ rightsDeclaration: null });
    const result = await executeDemandResearch(request, "When was the prism effect discovered?", [], ["Anika Sen"], deps);
    expect(result.findings[0]).toMatchObject({ retention: "transient_only", verificationReady: false });
  });

  it("does not trust a reputable domain without document provenance", async () => {
    const { deps } = fixture();
    deps.read = async () => excerpt({ identity: authenticateSource({ url, title: "History of the prism effect" }) });
    const result = await executeDemandResearch(request, "When was the prism effect discovered?", [], ["Anika Sen"], deps);
    expect(result.findings).toHaveLength(0);
    expect(result.candidates[0].decision).toBe("unverified");
  });

  it("blocks unsafe or prohibited URLs before reading", async () => {
    const { deps, calls } = fixture();
    deps.inspect = async () => null;
    const result = await executeDemandResearch(request, "When was the prism effect discovered?", [], ["Anika Sen"], deps);
    expect(calls).toHaveLength(1);
    expect(result.candidates[0].decision).toBe("unverified");
    expect(result.usage.sourceFetches).toBe(0);
  });

  it("honors exhaustion, active leases, provider errors, and source failures", async () => {
    const { deps, calls } = fixture();
    expect((await executeDemandResearch({ ...request, maxExternalSearches: 0 }, "date?", [], ["Anika Sen"], deps)).status).toBe("budget_exhausted");
    deps.claimNeed = async () => "active";
    expect((await executeDemandResearch(request, "date?", [], ["Anika Sen"], deps)).status).toBe("in_progress");
    expect(calls).toHaveLength(0);
    deps.claimNeed = async () => "acquired";
    deps.provider.search = async () => { throw new Error("RATE_LIMIT"); };
    const providerFailure = await executeDemandResearch(request, "date?", [], ["Anika Sen"], deps);
    expect(providerFailure).toMatchObject({ status: "failed", usage: { searchCalls: 1, errorCategory: "RATE_LIMIT" } });
    deps.provider.search = async () => [{ title: "source", url, sourceProvider: "mock" }];
    deps.read = async () => { throw new Error("FETCH_FAILED"); };
    const sourceFailure = await executeDemandResearch(request, "date?", [], ["Anika Sen"], deps);
    expect(sourceFailure.status).toBe("insufficient");
    expect(sourceFailure.candidates[0].decision).toBe("unreadable");
  });

  it("prevents concurrent equivalent needs from issuing a second search", async () => {
    const { deps, calls } = fixture();
    let leased = false;
    deps.claimNeed = async () => { if (leased) return "active"; leased = true; return "acquired"; };
    const [first, second] = await Promise.all([executeDemandResearch(request, "date?", [], ["Anika Sen"], deps),
      executeDemandResearch(request, "date?", [], ["Anika Sen"], deps)]);
    expect([first.status, second.status].sort()).toEqual(["complete", "in_progress"]);
    expect(calls).toHaveLength(1);
  });
});
