import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { executeDemandResearch, narrowQuery, type FetchedExcerpt, type ResearchDependencies } from "@/lib/live-research/on-demand-engine";
import type { EvidenceGapRequest } from "@/lib/ask/question-resolution";
import type { RetrievedEvidence } from "@/lib/corpus/types";
import { authenticateSource } from "@/lib/live-research/research-quality";
import { sourcePriority } from "@/lib/live-research/search-credibility";

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
  it("admits two independently licensed PMC leads without a paid Brave search", async () => {
    const previous = process.env.DEMAND_AUTO_ADMISSION_ENABLED;
    process.env.DEMAND_AUTO_ADMISSION_ENABLED = "true";
    try {
      const ids = ["PMC4763617", "PMC11505626", "PMC10937994"];
      const { deps, calls } = fixture([]);
      deps.openAccessSearch = async () => ids.map((value) => ({ url: `https://pmc.ncbi.nlm.nih.gov/articles/${value}/`,
        title: value, sourceProvider: "pmc" }));
      deps.inspect = async (candidate) => ({ url: candidate, domain: "pmc.ncbi.nlm.nih.gov", category: "institutional", title: candidate });
      deps.read = async (source) => excerpt({ url: source.url,
        identity: authenticateSource({ url: source.url, title: source.url, author: "Researcher",
          publisher: source.url.includes("4763617") ? "Restricted Press" : source.url.includes("11505626") ? "MDPI" : "Nature",
          doi: source.url.includes("4763617") ? "10.1000/one" : source.url.includes("11505626") ? "10.1000/two" : "10.1000/three",
          sourceType: "scholarly journal" }),
        rightsDeclaration: source.url.includes("4763617") ? "https://creativecommons.org/licenses/by-nc-sa/3.0/"
          : "https://creativecommons.org/licenses/by/4.0/" });
      const result = await executeDemandResearch(request, "What physics discovery did Anika Sen make?", [], ["Anika Sen"], deps);
      expect(calls).toHaveLength(0);
      expect(result.usage).toMatchObject({ searchCalls: 0, sourceFetches: 3 });
      expect(result.findings.map((finding) => finding.retention)).toEqual(["transient_only", "license_candidate", "license_candidate"]);
      expect(result.passages.every((passage) => passage.origin === "pmc_oai")).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.DEMAND_AUTO_ADMISSION_ENABLED;
      else process.env.DEMAND_AUTO_ADMISSION_ENABLED = previous;
    }
  });
  it("replays the Bose discovery failure and preserves the named institution in admission search", () => {
    const replay = JSON.parse(readFileSync(new URL("../fixtures/bose-source-selection-2026-10-23.json", import.meta.url), "utf8")) as {
      question: string; previousQuery: string; observedRankedCandidates: Array<{ url: string; selectionOrder: number }>;
      licensedCandidatesAbsentFromBraveTop20: Array<{ url: string; discoverySummary: string }> };
    expect(replay.previousQuery).not.toContain('"Bose Institute"');
    expect(replay.observedRankedCandidates.filter((item) => [2, 3, 4, 6].includes(item.selectionOrder))).toHaveLength(4);
    expect(replay.observedRankedCandidates.some((item) => replay.licensedCandidatesAbsentFromBraveTop20.some((source) => source.url === item.url))).toBe(false);
    const prior = process.env.DEMAND_AUTO_ADMISSION_ENABLED;
    try {
      process.env.DEMAND_AUTO_ADMISSION_ENABLED = "true";
      const query = narrowQuery({ ...request, personalityName: "Jagadish Chandra Bose" }, replay.question);
      expect(query).toContain('"Bose Institute"');
      expect(query).toContain("open access");
      expect(query).not.toContain("archive museum university");
      process.env.DEMAND_AUTO_ADMISSION_ENABLED = "false";
      expect(narrowQuery({ ...request, personalityName: "Jagadish Chandra Bose" }, replay.question)).toBe(replay.previousQuery);
    } finally {
      if (prior === undefined) delete process.env.DEMAND_AUTO_ADMISSION_ENABLED;
      else process.env.DEMAND_AUTO_ADMISSION_ENABLED = prior;
    }
  });

  it("keeps a contemporaries follow-up focused even when admission is enabled", () => {
    const previous = process.env.DEMAND_AUTO_ADMISSION_ENABLED;
    process.env.DEMAND_AUTO_ADMISSION_ENABLED = "true";
    try {
      const query = narrowQuery({ ...request, personalityName: "A. P. J. Abdul Kalam" },
        "Who else was doing similar work at the time? Follow-up to: What did A. P. J. Abdul Kalam do for India's space programme? About A. P. J. Abdul Kalam.");
      expect(query).toContain("space programme");
      expect(query).toContain("contemporaries");
      expect(query).not.toContain('"Follow');
    } finally {
      if (previous === undefined) delete process.env.DEMAND_AUTO_ADMISSION_ENABLED;
      else process.env.DEMAND_AUTO_ADMISSION_ENABLED = previous;
    }
  });

  it("uses article-specific license snippets only as a discovery ordering hint", () => {
    const replay = JSON.parse(readFileSync(new URL("../fixtures/bose-source-selection-2026-10-23.json", import.meta.url), "utf8")) as {
      question: string; licensedCandidatesAbsentFromBraveTop20: Array<{ url: string; discoverySummary: string }> };
    const article = replay.licensedCandidatesAbsentFromBraveTop20[0];
    const plain = sourcePriority(article.url, article.discoverySummary, replay.question);
    const hinted = sourcePriority(article.url, article.discoverySummary, replay.question, "", article.discoverySummary);
    expect(hinted).toBe(plain + 4);
    expect(sourcePriority(article.url, article.discoverySummary, replay.question, "", "Photo licensed under https://creativecommons.org/licenses/by-nc/4.0/"))
      .toBe(plain);
  });
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

  it("returns safe page leads when none supports the question", async () => {
    const { deps } = fixture();
    deps.read = async () => null;
    const result = await executeDemandResearch(request, "When did Anika Sen discover the prism effect?", [], ["Anika Sen"], deps);
    expect(result).toMatchObject({ status: "insufficient", citeableNow: false, findings: [],
      leads: [{ url, title: "History of the prism effect" }] });
  });

  it("does not offer access-restricted pages as leads", async () => {
    const { deps } = fixture();
    deps.robotsAllowed = async () => false;
    const result = await executeDemandResearch(request, "When did Anika Sen discover the prism effect?", [], ["Anika Sen"], deps);
    expect(result.leads).toEqual([]);
  });

  it("cites a directly supporting unlicensed page for Ask without making it eligible for Resources", async () => {
    const { deps } = fixture();
    deps.read = async () => excerpt({ rightsDeclaration: null,
      identity: authenticateSource({ url, title: "History of the prism effect" }) });
    const result = await executeDemandResearch(request, "When did Anika Sen discover the prism effect?", [], ["Anika Sen"], deps);
    expect(result).toMatchObject({ status: "complete", citeableNow: true });
    expect(result.findings[0]).toMatchObject({ retention: "transient_only", verificationReady: false,
      source: { provenanceComplete: false } });
    expect(result.passages).toHaveLength(1);
  });

  it("keeps a licensed unknown-publisher page out of Resources", async () => {
    const { deps } = fixture();
    deps.inspect = async (candidate, title) => ({ url: candidate, domain: new URL(candidate).hostname, category: "general_web", title });
    const result = await executeDemandResearch(request, "When did Anika Sen discover the prism effect?", [], ["Anika Sen"], deps);
    expect(result).toMatchObject({ citeableNow: true, sufficientForVerification: false });
    expect(result.findings[0]).toMatchObject({ retention: "license_candidate", verificationReady: false });
  });

  it("reads independent URLs even when search results have the same title", async () => {
    const secondUrl = "https://press.example.net/history/prism";
    const { deps } = fixture([{ title: "Anika Sen prism effect", url, sourceProvider: "mock" },
      { title: "Anika Sen prism effect", url: secondUrl, sourceProvider: "mock" }]);
    deps.read = async (source) => excerpt({ url: source.url,
      identity: authenticateSource({ url: source.url, title: "Anika Sen prism effect", author: "M. Rao",
        publisher: source.url === url ? "University" : "Press", publicationDate: "2001",
        doi: source.url === url ? "10.1234/prism" : "10.5678/prism" }) });
    const prior = process.env.DEMAND_VERIFICATION_SHADOW_ENABLED;
    try {
      process.env.DEMAND_VERIFICATION_SHADOW_ENABLED = "true";
      const result = await executeDemandResearch(request, "When did Anika Sen discover the prism effect?", [], ["Anika Sen"], deps);
      expect(result.findings.map((finding) => finding.source.url)).toEqual([url, secondUrl]);
    } finally {
      if (prior === undefined) delete process.env.DEMAND_VERIFICATION_SHADOW_ENABLED;
      else process.env.DEMAND_VERIFICATION_SHADOW_ENABLED = prior;
    }
  });

  it("prioritizes a relevant institutional result before spending the four source reads", async () => {
    const weak = Array.from({ length: 7 }, (_, index) => ({ title: `General profile ${index}`,
      url: `https://profiles.example.com/person/${index}`, sourceProvider: "mock" }));
    const official = { title: "Anika Sen prism effect discovery date", url: "https://records.gov/prism-effect",
      sourceProvider: "mock" };
    const { deps, calls } = fixture([...weak, official]);
    const readUrls: string[] = [];
    deps.read = async (source, statement) => {
      readUrls.push(source.url);
      expect(statement).toBe("When did Anika Sen discover the prism effect?");
      return source.url === official.url ? excerpt({ url: official.url }) : null;
    };
    const result = await executeDemandResearch(request, "When did Anika Sen discover the prism effect?", [], ["Anika Sen"], deps);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("prism effect");
    expect(calls[0]).not.toContain("dated original account");
    expect(readUrls[0]).toBe(official.url);
    expect(result.findings).toHaveLength(1);
    expect(result.usage.sourceFetches).toBe(1);
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
    expect(result).toMatchObject({ status: "complete", citeableNow: true, sufficientForVerification: false });
  });

  it("stops after a sufficient transient source when admission is disabled", async () => {
    const secondUrl = "https://archive.example.org/second-prism-record";
    const { deps } = fixture([{ title: "History of the prism effect", url, sourceProvider: "mock" },
      { title: "Second prism record", url: secondUrl, sourceProvider: "mock" }]);
    const reads: string[] = [];
    deps.read = async (source) => { reads.push(source.url); return excerpt({ url: source.url, rightsDeclaration: null }); };
    const result = await executeDemandResearch(request, "When did Anika Sen discover the prism effect?", [], ["Anika Sen"], deps);
    expect(result).toMatchObject({ status: "complete", citeableNow: true, usage: { sourceFetches: 1 } });
    expect(reads).toHaveLength(1);
  });

  it("continues the same bounded search past an unlicensed page to an explicitly licensed work", async () => {
    const previous = process.env.DEMAND_AUTO_ADMISSION_ENABLED;
    process.env.DEMAND_AUTO_ADMISSION_ENABLED = "true";
    try {
    const licensedUrl = "https://archive.example.org/prism-record";
    const title = "Anika Sen prism effect date";
    const { deps, calls } = fixture([{ title, url, sourceProvider: "mock" },
      { title: "Anika Sen prism effect dated record", url: licensedUrl, sourceProvider: "mock" }]);
    deps.inspect = async (candidate, sourceTitle) => ({ url: candidate, domain: new URL(candidate).hostname,
      category: "institutional", title: sourceTitle });
    deps.read = async (source) => excerpt({ url: source.url,
      identity: authenticateSource({ url: source.url, title: `Record at ${new URL(source.url).hostname}`,
        author: "Registrar", publisher: "University" }),
      rightsDeclaration: source.url === licensedUrl ? "https://creativecommons.org/licenses/by/4.0/" : null });
    const result = await executeDemandResearch(request, "When did Anika Sen discover the prism effect?", [], ["Anika Sen"], deps);
    expect(calls).toHaveLength(1);
    expect(result.usage.sourceFetches).toBe(2);
    expect(result.findings.map((finding) => finding.retention)).toEqual(["transient_only", "license_candidate"]);
    expect(result.findings[1].verificationReady).toBe(true);
    expect(result.sufficientForVerification).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.DEMAND_AUTO_ADMISSION_ENABLED;
      else process.env.DEMAND_AUTO_ADMISSION_ENABLED = previous;
    }
  });

  it("keeps reading for an independent licensed work after one retainable passage", async () => {
    const previous = process.env.DEMAND_AUTO_ADMISSION_ENABLED;
    process.env.DEMAND_AUTO_ADMISSION_ENABLED = "true";
    try {
      const secondUrl = "https://records.example.edu/prism-date";
      const thirdUrl = "https://press.example.org/prism-history";
      const { deps } = fixture([
        { title: "Anika Sen prism effect date at university", url, sourceProvider: "mock" },
        { title: "Anika Sen prism chronology in records", url: secondUrl, sourceProvider: "mock" },
        { title: "Anika Sen prism history in press", url: thirdUrl, sourceProvider: "mock" },
      ]);
      deps.inspect = async (candidate, title) => ({ url: candidate, domain: new URL(candidate).hostname, category: "scholarly", title });
      deps.read = async (source) => excerpt({ url: source.url,
        identity: authenticateSource({ url: source.url, title: `Independent work at ${source.domain}`,
          author: "Historian", publisher: source.domain, publicationDate: "2001", category: "scholarly" }) });
      const result = await executeDemandResearch(request, "When did Anika Sen discover the prism effect?", [], ["Anika Sen"], deps);
      expect(result.usage.sourceFetches).toBe(2);
      expect(result.findings).toHaveLength(2);
      expect(new Set(result.findings.map((finding) => finding.source.publisherDomain)).size).toBe(2);
    } finally {
      if (previous === undefined) delete process.env.DEMAND_AUTO_ADMISSION_ENABLED;
      else process.env.DEMAND_AUTO_ADMISSION_ENABLED = previous;
    }
  });

  it("withholds an answer when two retrieved original pages give conflicting dates", async () => {
    const previous = process.env.DEMAND_AUTO_ADMISSION_ENABLED;
    process.env.DEMAND_AUTO_ADMISSION_ENABLED = "true";
    try {
      const secondUrl = "https://archive.example.org/other-prism-date";
      const { deps } = fixture([{ title: "Prism date history", url, sourceProvider: "mock" },
        { title: "Other prism date history", url: secondUrl, sourceProvider: "mock" }]);
      deps.inspect = async (candidate, sourceTitle) => ({ url: candidate, domain: new URL(candidate).hostname,
        category: "institutional", title: sourceTitle });
      deps.read = async (source) => excerpt({ url: source.url,
        text: `Anika Sen discovered the prism effect in ${source.url === url ? "1928" : "1929"}.`,
        identity: authenticateSource({ url: source.url, title: `Prism date at ${new URL(source.url).hostname}`,
          author: "Registrar", publisher: "University" }),
        rightsDeclaration: source.url === url ? null : "https://creativecommons.org/licenses/by/4.0/" });
      const contested = { ...request, gaps: [...request.gaps, { ...request.gaps[0],
        id: "c".repeat(64), requirementKey: "contested", type: "contested_claim" as const }] };
      const result = await executeDemandResearch(contested, "When did Anika Sen discover the prism effect?", [], ["Anika Sen"], deps);
      expect(result.usage.sourceFetches).toBe(2);
      expect(result.status).toBe("insufficient");
      expect(result.citeableNow).toBe(false);
      expect(result.unresolvedGaps.some((gap) => gap.type === "conflicting_evidence")).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.DEMAND_AUTO_ADMISSION_ENABLED;
      else process.env.DEMAND_AUTO_ADMISSION_ENABLED = previous;
    }
  });

  it("keeps a reputable page without document provenance out of admission", async () => {
    const { deps } = fixture();
    deps.read = async () => excerpt({ identity: authenticateSource({ url, title: "History of the prism effect" }) });
    const result = await executeDemandResearch(request, "When was the prism effect discovered?", [], ["Anika Sen"], deps);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].verificationReady).toBe(false);
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

  it("stops before the paid search when a cross-instance budget reservation is denied", async () => {
    const { deps, calls } = fixture();
    let finished: { outcome: string; cooldown: number } | null = null;
    deps.reserveBudget = async () => ({ status: "daily_limit" });
    deps.finishNeed = async (_need, _owner, outcome, _searches, _details, cooldown) => {
      finished = { outcome, cooldown };
    };
    const result = await executeDemandResearch(request, "date?", [], ["Anika Sen"], deps);
    expect(result).toMatchObject({ status: "budget_exhausted", budgetStatus: "daily_limit", attempted: false });
    expect(calls).toHaveLength(0);
    expect(finished).toEqual({ outcome: "insufficient", cooldown: 120 });
  });

  it("stops before search if reservation pricing is malformed", async () => {
    const { deps, calls } = fixture();
    deps.reserveBudget = async () => ({ status: "reserved", reservationId: "reservation" });
    const result = await executeDemandResearch(request, "date?", [], ["Anika Sen"], deps);
    expect(result.status).toBe("budget_exhausted");
    expect(calls).toHaveLength(0);
  });
});
