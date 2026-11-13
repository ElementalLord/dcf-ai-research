import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assessCredibility, credibilityTier } from "@/lib/knowledge-harvest/credibility";
import { buildHarvest, groupByWork, type TrackRecord } from "@/lib/knowledge-harvest/plan";
import { passageHash, questionFingerprint, topicTerms } from "@/lib/knowledge-harvest/topics";
import type { RetrievedPassage } from "@/lib/corpus/types";

const state = vi.hoisted(() => ({ rpc: vi.fn(), subject: vi.fn(), inspect: vi.fn(), read: vi.fn(), access: vi.fn() }));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { rpc: state.rpc } }));
vi.mock("@/lib/live-research/search-credibility", () => ({ readSubjectPassages: state.subject,
  inspectSearchSource: state.inspect, readGroundedExcerpt: state.read, sourceAccess: state.access }));

const person = "11111111-1111-4111-8111-111111111111";
const policy = { mode: "credible_web" as const, rules: [] };
const passage = (overrides: Partial<RetrievedPassage> = {}): RetrievedPassage => ({
  kind: "passage", id: "google:0:0", chunkId: "google:0:0", sourceId: "google:0",
  text: "C. V. Raman discovered in 1928 that light scattered by a liquid changes wavelength, the effect that carries his name.",
  sectionTitle: null, pageOrSection: "The discovery", textualLayer: null, sourceTitle: "The Raman Effect", sourceAuthor: null,
  sourceInstitution: "nobelprize.org", sourceUrl: "https://www.nobelprize.org/prizes/physics/1930/raman/facts/",
  sourceType: "institutional", sourceStatus: "discovered", personalityId: person, personalityName: "C. V. Raman",
  origin: "google_grounding", supportLevel: "STRONG", supportReason: "Covers the central topic.", accessibility: "READABLE",
  evidenceType: "institutional_record", workKey: "page:nobelprize.org/prizes/physics/1930/raman/facts",
  provenance: { title: "The Raman Effect", publisher: "Nobel Prize Outreach", complete: true }, ...overrides });
const job = (passages: RetrievedPassage[], cited: string[] = []) => ({ personalityId: person, personalityName: "C. V. Raman",
  aliases: ["Raman"], question: "What did C. V. Raman discover about light scattering?", passages, citedChunkIds: new Set(cited) });

describe("source credibility", () => {
  const base = { url: "https://www.nobelprize.org/a", authorityLevel: "authoritative" as const, evidenceType: "institutional_record" as const,
    provenance: { title: "T", publisher: "P" }, bestSupport: "STRONG" as const };
  it("explains every point and places a recognized institution in the credible tier", () => {
    const result = assessCredibility(base);
    expect(result.rejected).toBeNull();
    expect(result.score).toBe(result.signals.reduce((sum, signal) => sum + signal.points, 0));
    expect(result.tier).toBe("credible");
    expect(result.signals.map((signal) => signal.key)).toEqual(expect.arrayContaining(["publisher", "evidence_type", "provenance", "passage_support"]));
  });
  it("reaches trusted only with identity, exact support or corroboration", () => {
    expect(assessCredibility({ ...base, bestSupport: "EXACT", independentCorroboration: 2,
      provenance: { title: "T", author: "A", publisher: "P", publicationDate: "1930", doi: "10.1/x" } }).tier).toBe("trusted");
  });
  it("never trusts an unrecognized publisher on overlap and metadata alone", () => {
    const anonymous = assessCredibility({ ...base, url: "https://some-site.example/a", authorityLevel: "general_web", evidenceType: "general_web",
      provenance: { title: "T" }, bestSupport: "EXACT", independentCorroboration: 2, trackRecord: { distinctQuestions: 9, timesCited: 9, consecutiveRecallFailures: 0 } });
    expect(anonymous.score).toBeLessThan(50);
    const named = assessCredibility({ ...base, url: "https://some-site.example/a", authorityLevel: "general_web", evidenceType: "scholarly_interpretation",
      provenance: { title: "T", author: "A", publisher: "P", publicationDate: "2001", doi: "10.1/x", journal: "J" }, bestSupport: "EXACT",
      independentCorroboration: 2, trackRecord: { distinctQuestions: 9, timesCited: 9, consecutiveRecallFailures: 0 } });
    expect(named.score).toBeLessThanOrEqual(74);
    expect(named.tier).not.toBe("trusted");
  });
  it("refuses unsafe, low-quality, blocked and unsupported sources outright", () => {
    expect(assessCredibility({ ...base, url: "http://www.nobelprize.org/a" }).rejected).toBeTruthy();
    expect(assessCredibility({ ...base, url: "https://en.wikipedia.org/wiki/Raman" }).rejected).toBeTruthy();
    expect(assessCredibility({ ...base, url: "https://user:pw@www.nobelprize.org/a" }).rejected).toBeTruthy();
    expect(assessCredibility({ ...base, adminRule: "blocked" }).rejected).toBeTruthy();
    expect(assessCredibility({ ...base, bestSupport: "RELATED" }).rejected).toBeTruthy();
    expect(assessCredibility({ ...base, bestSupport: null }).rejected).toBeTruthy();
  });
  it("rewards a track record and penalizes repeated recall failures", () => {
    const fresh = assessCredibility(base).score;
    expect(assessCredibility({ ...base, trackRecord: { distinctQuestions: 3, timesCited: 2, consecutiveRecallFailures: 0 } }).score).toBe(fresh + 6);
    expect(assessCredibility({ ...base, trackRecord: { distinctQuestions: 1, timesCited: 0, consecutiveRecallFailures: 2 } }).score).toBe(fresh - 10);
  });
  it("recognizes Routledge and Taylor & Francis as academic publishers", async () => {
    const { classifySourceAuthority } = await import("@/lib/sources/authority");
    for (const url of ["https://www.routledge.com/Subhas-Chandra-Bose/book/123", "https://www.taylorfrancis.com/chapters/x", "https://www.palgrave.com/book/1"])
      expect(classifySourceAuthority({ url, live: true }).level).toBe("authoritative");
  });
  it("maps scores to tiers at fixed thresholds", () => {
    expect([75, 74, 50, 49, 30, 29].map(credibilityTier)).toEqual(["trusted", "credible", "credible", "provisional", "provisional", "unverified"]);
  });
});

describe("topic terms", () => {
  it("drops the subject's name and filler, stems, and is stable for paraphrases", () => {
    const terms = topicTerms("What did C. V. Raman discover about the scattering of light?", ["C. V. Raman"]);
    expect(terms).toEqual(expect.arrayContaining(["discover", "scatter", "light"]));
    expect(terms).not.toContain("raman");
    expect(questionFingerprint(person, "Light scattering: what did Raman discover?", ["C. V. Raman", "Raman"]))
      .toBe(questionFingerprint(person, "What did Raman discover about light scattering?", ["C. V. Raman", "Raman"]));
    expect(questionFingerprint(person, "When was Raman born?", ["Raman"])).not.toBe(questionFingerprint(person, "Where did Raman study?", ["Raman"]));
  });
  it("hashes a passage independent of spacing and case", () => {
    expect(passageHash("Raman  was BORN in 1888.")).toBe(passageHash("raman was born in 1888"));
  });
});

describe("harvest planning", () => {
  it("ignores approved Library passages, unreadable pages and non-HTTPS sources", () => {
    expect(groupByWork([passage({ origin: "permanent" }), passage({ accessibility: "UNREADABLE" }), passage({ sourceUrl: "http://example.org/a" }), passage({ sourceUrl: null })])).toHaveLength(0);
  });
  it("stores a pointer, not the passage, when the page declares no open licence", () => {
    const payload = buildHarvest(job([passage()], ["google:0:0"]));
    expect(payload.sources).toHaveLength(1);
    const [source] = payload.sources;
    expect(source).toMatchObject({ retention: "pointer_only", cited: true, provider: "google", authority_level: "authoritative" });
    expect(source.findings[0]).toMatchObject({ excerpt: null, cited: true, support_level: "STRONG", kind: "answer_evidence" });
    expect(source.findings[0].topic_terms).toEqual(expect.arrayContaining(["scatter", "light", "1928"]));
    expect(JSON.stringify(payload)).not.toContain("What did");
    expect(payload.question_hash).toMatch(/^[0-9a-f]{40}$/);
  });
  it("keeps the excerpt for an openly licensed work", () => {
    const payload = buildHarvest(job([passage({ rightsDeclaration: "https://creativecommons.org/licenses/by/4.0/" })]));
    expect(payload.sources[0].retention).toBe("licensed_excerpt");
    expect(payload.sources[0].findings[0].excerpt).toContain("discovered in 1928");
  });
  it("groups several URLs of one work and counts corroboration only across publishers", () => {
    const second = passage({ id: "b", chunkId: "b", sourceUrl: "https://www.britannica.com/biography/C-V-Raman", sourceInstitution: "britannica.com",
      workKey: "page:britannica.com/biography/C-V-Raman", evidenceType: "edited_secondary", text: "Raman received the 1930 Nobel Prize for Physics for his work on the scattering of light." });
    const mirror = passage({ id: "c", chunkId: "c", sourceUrl: "https://www.nobelprize.org/prizes/physics/1930/raman/facts/?print=1", text: "Raman observed scattered light of changed frequency in 1928 at Calcutta." });
    const payload = buildHarvest(job([passage(), second, mirror]));
    expect(payload.sources).toHaveLength(2);
    const nobel = payload.sources.find((source) => source.domain === "www.nobelprize.org")!;
    expect(nobel.findings).toHaveLength(2);
    expect(nobel.findings[0].corroboration).toBe(1);
    expect(nobel.signals.find((signal) => signal.key === "corroboration")?.points).toBe(5);
  });
  it("drops low-quality hosts and passages that only relate to the question", () => {
    const payload = buildHarvest(job([passage({ sourceUrl: "https://www.quora.com/raman", workKey: "page:quora.com/raman" }), passage({ id: "r", chunkId: "r", supportLevel: "RELATED", workKey: "page:x", sourceUrl: "https://example.edu/x" })]));
    expect(payload.sources).toHaveLength(0);
  });
  it("uses the prior track record without double counting a repeated question", () => {
    const repeat: TrackRecord = { status: "active", distinctQuestions: 1, timesCited: 1, consecutiveRecallFailures: 0, seenQuestion: true };
    const fresh: TrackRecord = { ...repeat, seenQuestion: false };
    const key = passage().workKey!;
    const first = buildHarvest(job([passage()])).sources[0].score;
    expect(buildHarvest(job([passage()]), new Map([[key, repeat]])).sources[0].score).toBe(first + 1);
    expect(buildHarvest(job([passage()]), new Map([[key, fresh]])).sources[0].score).toBe(first + 3);
  });
  it("honours an administrator's block", () => {
    expect(buildHarvest({ ...job([passage()]), rules: [{ domain: "nobelprize.org", status: "blocked", category: "other" }] }).sources).toHaveLength(0);
  });
});

describe("harvest persistence and recall", () => {
  beforeEach(async () => { (await import("@/lib/knowledge-harvest/harvest")).resetHarvestStoreAvailability(); });
  afterEach(() => { vi.unstubAllEnvs(); Object.values(state).forEach((mock) => mock.mockReset()); });

  it("records the answer's sources plus additional passages from the same page", async () => {
    const { runHarvest } = await import("@/lib/knowledge-harvest/harvest");
    state.rpc.mockImplementation(async (name: string) => name === "knowledge_source_track_records" ? { data: [], error: null }
      : { data: { sources: 1, findings: 2, new_sources: 1, new_findings: 2, promotion_ready: 0 }, error: null });
    state.subject.mockResolvedValue([{ text: "Raman was born in 1888 in Tiruchirappalli and studied at Presidency College, Madras, where he published in 1906.", locator: "Early life",
      url: passage().sourceUrl, title: "The Raman Effect", identity: {}, rightsDeclaration: null }]);
    const outcome = await runHarvest({ ...job([passage()], ["google:0:0"]), policy });
    expect(outcome).toMatchObject({ stored: true, newSources: 1, newFindings: 2 });
    const payload = state.rpc.mock.calls.find(([name]) => name === "record_knowledge_harvest")![1].p_harvest;
    expect(payload.sources[0].findings.map((finding: { kind: string }) => finding.kind)).toEqual(["answer_evidence", "deep_harvest"]);
    expect(payload.sources[0].findings[1]).toMatchObject({ excerpt: null, support_level: null, cited: false, locator: "Early life" });
  });
  it("does nothing when switched off or when nothing live was read", async () => {
    const { runHarvest } = await import("@/lib/knowledge-harvest/harvest");
    expect(await runHarvest({ ...job([]), policy })).toMatchObject({ stored: false, reason: "no_live_evidence" });
    vi.stubEnv("KNOWLEDGE_HARVEST_ENABLED", "false");
    expect(await runHarvest({ ...job([passage()]), policy })).toMatchObject({ stored: false, reason: "disabled" });
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("never throws, and stops asking a database that lacks the harvest tables", async () => {
    const { runHarvest } = await import("@/lib/knowledge-harvest/harvest");
    const { recallKnownSources } = await import("@/lib/knowledge-harvest/recall");
    state.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "function not found" } });
    expect((await runHarvest({ ...job([passage()]), policy })).stored).toBe(false);
    expect(state.rpc).toHaveBeenCalledTimes(1);
    expect((await runHarvest({ ...job([passage()]), policy })).reason).toBe("store_unavailable");
    expect((await recallKnownSources({ personalityId: person, personalityName: "C. V. Raman", aliases: [], question: "Raman light scattering", policy })).attempted).toBe(0);
    expect(state.rpc).toHaveBeenCalledTimes(1);
  });
  it("re-reads a remembered source and only returns a passage that still supports the question", async () => {
    const { recallKnownSources } = await import("@/lib/knowledge-harvest/recall");
    state.rpc.mockResolvedValue({ data: [
      { source_id: "s1", canonical_url: "https://www.nobelprize.org/a", title: "A", domain: "www.nobelprize.org", evidence_type: "institutional_record", credibility_score: 80, credibility_tier: "trusted", matched_terms: 2, findings: 1 },
      { source_id: "s2", canonical_url: "https://www.britannica.com/b", title: "B", domain: "www.britannica.com", evidence_type: "edited_secondary", credibility_score: 60, credibility_tier: "credible", matched_terms: 2, findings: 1 },
      { source_id: "s3", canonical_url: "https://gone.example.edu/c", title: "C", domain: "gone.example.edu", evidence_type: "institutional_record", credibility_score: 60, credibility_tier: "credible", matched_terms: 2, findings: 1 },
    ], error: null });
    state.inspect.mockImplementation(async (url: string, _policy: unknown, title: string) => ({ url, domain: new URL(url).hostname, category: "institutional", title }));
    state.read.mockImplementation(async (source: { url: string }) => source.url.includes("nobelprize") ? { text: "Raman discovered the scattering effect in 1928.", title: "A", url: source.url, locator: "Facts",
      supportLevel: "STRONG", supportReason: "ok", rightsDeclaration: null,
      identity: { title: "A", author: null, publisher: "Nobel", publicationDate: null, journal: null, doi: null, isbn: null, evidenceType: "institutional_record", workKey: "page:nobelprize.org/a", provenanceComplete: true } } : null);
    state.access.mockImplementation(async (url: string) => url.includes("gone") ? "unreadable" : "readable");
    const result = await recallKnownSources({ personalityId: person, personalityName: "C. V. Raman", aliases: ["Raman"], question: "What did Raman discover about light scattering?", policy });
    expect(state.rpc).toHaveBeenCalledWith("recall_knowledge_sources", expect.objectContaining({ p_personality_id: person, p_terms: expect.arrayContaining(["scatter", "light"]) }));
    expect(result.attempted).toBe(3);
    expect(result.passages).toHaveLength(1);
    expect(result.passages[0]).toMatchObject({ origin: "knowledge_recall", sourceStatus: "discovered", supportLevel: "STRONG", accessibility: "READABLE" });
    // The readable page that did not cover this question is not a failure; the unreachable one is.
    expect(result.failures).toEqual(["s3"]);
  });
  it("respects an allowlist-only policy with no allowed domains and a blocked domain", async () => {
    const { recallKnownSources } = await import("@/lib/knowledge-harvest/recall");
    const base = { personalityId: person, personalityName: "C. V. Raman", aliases: [], question: "Raman light scattering" };
    expect((await recallKnownSources({ ...base, policy: { mode: "approved_domains_only", rules: [] } })).attempted).toBe(0);
    expect(state.rpc).not.toHaveBeenCalled();
    state.rpc.mockResolvedValue({ data: [{ source_id: "s1", canonical_url: "https://www.nobelprize.org/a", title: "A", domain: "www.nobelprize.org", evidence_type: "x", credibility_score: 80, credibility_tier: "trusted", matched_terms: 2, findings: 1 }], error: null });
    const blocked = await recallKnownSources({ ...base, policy: { mode: "credible_web", rules: [{ id: "1", domain: "nobelprize.org", display_name: "N", status: "blocked", category: "other", notes: "" }] } });
    expect(blocked.attempted).toBe(0);
    expect(state.inspect).not.toHaveBeenCalled();
  });
});
