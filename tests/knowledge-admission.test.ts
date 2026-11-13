import { afterEach, describe, expect, it, vi } from "vitest";
import type { RetrievedPassage } from "@/lib/corpus/types";
import { buildHarvest } from "@/lib/knowledge-harvest/plan";

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { rpc: vi.fn(), from: vi.fn() } }));
vi.mock("@/lib/live-research/search-credibility", () => ({}));

const person = "33333333-3333-4333-8333-333333333333";
const name = "Jamsetji Tata";
const question = "When did Jamsetji Tata found the Empress Mills?";
const passage = (id: string, url: string, text: string, overrides: Partial<RetrievedPassage> = {}): RetrievedPassage => ({
  kind: "passage", id, chunkId: id, sourceId: id, text, sectionTitle: null, pageOrSection: "History", textualLayer: null,
  sourceTitle: `Record ${id}`, sourceAuthor: null, sourceInstitution: new URL(url).hostname, sourceUrl: url, sourceType: "institutional",
  sourceStatus: "discovered", personalityId: person, personalityName: name, origin: "google_grounding", supportLevel: "STRONG",
  accessibility: "READABLE", evidenceType: "institutional_record", workKey: `page:${new URL(url).hostname}${new URL(url).pathname}`,
  provenance: { title: `Record ${id}`, publisher: new URL(url).hostname }, ...overrides });
const archive = passage("a", "https://www.nationalarchives.gov.uk/tata", "Jamsetji Tata founded the Empress Mills at Nagpur in 1877, the year Queen Victoria was proclaimed Empress.");
const university = passage("b", "https://history.example.edu/tata", "In 1877 the industrialist Jamsetji Tata founded the Empress Mills in the city of Nagpur.");
const blog = passage("c", "https://tata-fans.example/story", "Jamsetji Tata founded the Empress Mills at Nagpur in 1877.", { evidenceType: "general_web", sourceType: "general_web" });
const input = (passages: RetrievedPassage[]) => ({ personalityId: person, personalityName: name, question, passages,
  payload: buildHarvest({ personalityId: person, personalityName: name, aliases: ["Tata"], question, passages, citedChunkIds: new Set(["a"]) }) });

const fact = { proposition: "Jamsetji Tata founded the Empress Mills in Nagpur in 1877.", type: "HISTORICAL_FACT" as const, evidenceIndexes: [0, 1],
  context: null, period: null, qualification: null, category: "ordinary_fact" as const };
const supported = { support: "SUPPORTED" as const, supportingIndexes: [0, 1], equivalentExisting: false, conflictsExisting: false, materialContradiction: false,
  exactEntities: true, exactDatesAndUnits: true, qualifiersPreserved: true, officialIssuer: false, independentDocuments: true, reason: "Both passages state it." };
function deps(candidates: unknown[] = [fact], assessment: Record<string, unknown> = supported, existing: Array<Record<string, unknown>> = []) {
  const provider = { extract: vi.fn(async () => candidates), assess: vi.fn(async () => assessment) };
  const store = { existing: vi.fn(async () => existing), admit: vi.fn<(input: { claim_text: string; sources: Array<Record<string, string>> }) => Promise<{ claimId: string; created: boolean }>>(async () => ({ claimId: "claim-1", created: true })),
    record: vi.fn<(input: Record<string, unknown>) => Promise<void>>(async () => undefined), suspend: vi.fn<(id: string, reason: string) => Promise<void>>(async () => undefined) };
  return { provider, store };
}
afterEach(() => vi.unstubAllEnvs());

describe("autonomous admission", () => {
  it("publishes a plain fact that two independent credible works state, in its own words and without source text", async () => {
    const { admitFromHarvest } = await import("@/lib/knowledge-harvest/admission");
    const d = deps();
    const result = await admitFromHarvest(input([archive, university]), d as never);
    expect(result.decisions).toEqual([expect.objectContaining({ outcome: "admitted", claimId: "claim-1" })]);
    expect(result.modelCalls).toBe(2);
    const payload = d.store.admit.mock.calls[0][0];
    expect(payload).toMatchObject({ personality_id: person, claim_text: fact.proposition, policy_version: "harvest-admission/1", epistemic_type: "HISTORICAL_FACT" });
    expect(payload.sources).toHaveLength(2);
    // The database is told which works and where, never the passage or the publisher's standing.
    expect(Object.keys(payload.sources[0]).sort()).toEqual(["locator", "work_key"]);
    expect(JSON.stringify(payload)).not.toContain("Queen Victoria");
    expect(d.store.record).not.toHaveBeenCalled();
  });
  it("spends no model call when the evidence could never satisfy the contract", async () => {
    const { admitFromHarvest } = await import("@/lib/knowledge-harvest/admission");
    for (const passages of [[university], [blog], [university, blog], [passage("p", "https://history.example.edu/x", university.text, { supportLevel: "PARTIAL" })]]) {
      const d = deps();
      const result = await admitFromHarvest(input(passages), d as never);
      expect(result.attempted).toBe(false);
      expect(d.provider.extract).not.toHaveBeenCalled();
      expect(d.store.admit).not.toHaveBeenCalled();
    }
  });
  it("can be switched off", async () => {
    const { admitFromHarvest } = await import("@/lib/knowledge-harvest/admission");
    vi.stubEnv("KNOWLEDGE_AUTO_ADMISSION_ENABLED", "false");
    const d = deps();
    expect(await admitFromHarvest(input([archive, university]), d as never)).toMatchObject({ attempted: false, skipped: "disabled" });
    expect(d.provider.extract).not.toHaveBeenCalled();
  });
  const held: Array<[string, Record<string, unknown>, Record<string, unknown> | undefined]> = [
    ["a year that is not in every passage", { proposition: "Jamsetji Tata founded the Empress Mills in Nagpur in 1874." }, undefined],
    ["a detail one passage does not state", { proposition: "Jamsetji Tata founded the Empress Mills in Nagpur in 1877 with borrowed capital." }, undefined],
    ["a priority claim", { proposition: "Jamsetji Tata founded the first Empress Mills in Nagpur in 1877." }, undefined],
    ["a hedged claim", { proposition: "Jamsetji Tata reportedly founded the Empress Mills in Nagpur in 1877." }, undefined],
    ["a quotation", { proposition: "Jamsetji Tata founded the \"Empress Mills\" in Nagpur in 1877." }, undefined],
    ["an interpretation", { type: "SCHOLARLY_INTERPRETATION", category: "interpretation" }, undefined],
    ["wording copied from a source", { proposition: "Jamsetji Tata founded the Empress Mills at Nagpur in 1877, the year Queen Victoria was proclaimed Empress.", evidenceIndexes: [0] }, undefined],
    ["a single merely credible source", { evidenceIndexes: [1] }, undefined],
    ["partial entailment", {}, { ...supported, support: "PARTIALLY_SUPPORTED" }],
    ["an entity mismatch", {}, { ...supported, exactEntities: false }],
    ["a date mismatch", {}, { ...supported, exactDatesAndUnits: false }],
    ["a passage the verifier did not accept", {}, { ...supported, supportingIndexes: [0] }],
    ["works that copy each other", {}, { ...supported, independentDocuments: false }],
    ["a contradiction", {}, { ...supported, materialContradiction: true }],
  ];
  it.each(held)("holds back %s", async (_label, change, assessment) => {
    const { admitFromHarvest } = await import("@/lib/knowledge-harvest/admission");
    const d = deps([{ ...fact, ...change }], assessment || supported);
    const result = await admitFromHarvest(input([archive, university]), d as never);
    expect(result.decisions).toHaveLength(1);
    expect(["quarantined", "rejected"]).toContain(result.decisions[0].outcome);
    expect(result.decisions[0].reasons[0]).toBeTruthy();
    expect(d.store.admit).not.toHaveBeenCalled();
    expect(d.store.record).toHaveBeenCalledWith(expect.objectContaining({ policy_version: "harvest-admission/1", outcome: result.decisions[0].outcome,
      reason_codes: result.decisions[0].reasons }));
  });
  it("rejects outright when the verifier finds the claim contradicted", async () => {
    const { admitFromHarvest } = await import("@/lib/knowledge-harvest/admission");
    const d = deps([fact], { ...supported, support: "CONTRADICTED" });
    expect((await admitFromHarvest(input([archive, university]), d as never)).decisions[0].outcome).toBe("rejected");
  });
  it("admits from one work only when it is trusted and authoritative", async () => {
    const { admitFromHarvest } = await import("@/lib/knowledge-harvest/admission");
    const strong = passage("t", "https://www.nationalarchives.gov.uk/tata", archive.text, { supportLevel: "EXACT",
      provenance: { title: "Tata papers", author: "Keeper of Records", publisher: "The National Archives", publicationDate: "1998", isbn: "9780000000001" } });
    const job = input([strong]);
    expect(job.payload.sources[0].tier).toBe("trusted");
    const d = deps([{ ...fact, evidenceIndexes: [0] }], { ...supported, supportingIndexes: [0] });
    expect((await admitFromHarvest(job, d as never)).decisions[0].outcome).toBe("admitted");
    expect(d.store.admit.mock.calls[0][0].sources).toHaveLength(1);
  });
  it("does not duplicate an existing claim and spends no entailment call on it", async () => {
    const { admitFromHarvest } = await import("@/lib/knowledge-harvest/admission");
    const d = deps([fact], supported, [{ id: "old", claim_text: "Jamsetji Tata founded the Empress Mills in Nagpur in 1877", approval_origin: "human_manual", approval_metadata: {} }]);
    const result = await admitFromHarvest(input([archive, university]), d as never);
    expect(result.decisions[0]).toMatchObject({ outcome: "duplicate", claimId: "old" });
    expect(d.provider.assess).not.toHaveBeenCalled();
    expect(d.store.admit).not.toHaveBeenCalled();
  });
  it("holds a competing value, and withdraws the earlier claim only if a machine admitted it", async () => {
    const { admitFromHarvest } = await import("@/lib/knowledge-harvest/admission");
    const older = { id: "old", claim_text: "Jamsetji Tata founded the Empress Mills in Nagpur in 1874.", approval_origin: "automated_evidence_verification" };
    const machine = deps([fact], supported, [{ ...older, approval_metadata: { storage_mode: "harvest_verified" } }]);
    expect((await admitFromHarvest(input([archive, university]), machine as never)).decisions[0].outcome).toBe("quarantined");
    expect(machine.store.suspend).toHaveBeenCalledWith("old", "contradiction");
    expect(machine.store.admit).not.toHaveBeenCalled();
    const human = deps([fact], supported, [{ ...older, approval_origin: "human_manual", approval_metadata: {} }]);
    await admitFromHarvest(input([archive, university]), human as never);
    expect(human.store.suspend).not.toHaveBeenCalled();
    expect(human.store.admit).not.toHaveBeenCalled();
  });
  it("never throws: a failed model, database or publication leaves nothing admitted", async () => {
    const { admitFromHarvest } = await import("@/lib/knowledge-harvest/admission");
    const noModel = deps();
    noModel.provider.extract.mockRejectedValue(new Error("503"));
    expect(await admitFromHarvest(input([archive, university]), noModel as never)).toMatchObject({ skipped: "extraction_unavailable", decisions: [] });
    const noVerifier = deps();
    noVerifier.provider.assess.mockRejectedValue(new Error("timeout"));
    expect((await admitFromHarvest(input([archive, university]), noVerifier as never)).decisions[0].outcome).toBe("quarantined");
    const refused = deps();
    refused.store.admit.mockRejectedValue(new Error("Automatic admission is paused"));
    refused.store.record.mockRejectedValue(new Error("down"));
    const result = await admitFromHarvest(input([archive, university]), refused as never);
    expect(result.decisions[0].outcome).toBe("quarantined");
    expect(result.decisions[0].reasons[0]).toContain("paused");
  });
  it("ignores malformed model output and verifies a repeated fact once", async () => {
    const { admitFromHarvest } = await import("@/lib/knowledge-harvest/admission");
    const d = deps([null, { proposition: "short" }, { ...fact, evidenceIndexes: [9] }, fact, fact, { ...fact, proposition: "Jamsetji Tata founded the Empress Mills in 1877 in Nagpur city." }]);
    const result = await admitFromHarvest(input([archive, university]), d as never);
    // Malformed entries are skipped, and a repeat or paraphrase of the same fact is verified only once.
    expect(result.decisions.map((decision) => decision.outcome)).toEqual(["admitted"]);
    expect(d.provider.assess).toHaveBeenCalledTimes(1);
  });
});
