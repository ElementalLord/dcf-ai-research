import { afterEach, describe, expect, it, vi } from "vitest";

// A tiny in-memory stand-in for the tables the epistemics engine reads and writes.
const db = vi.hoisted(() => ({ claims: [] as Array<Record<string, unknown>>, existing: [] as Array<Record<string, unknown>>,
  chunks: [] as Array<Record<string, unknown>>, sources: [] as Array<Record<string, unknown>>, written: [] as Array<Record<string, unknown>>, fail: false }));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (table: string) => {
  let ids: string[] = [];
  const query: Record<string, unknown> = {
    select: () => query, order: () => query, eq: () => query, range: () => query, in: (_c: string, value: string[]) => { ids = value; return query; },
    upsert: async (rows: Array<Record<string, unknown>>) => { db.written.push(...rows); return { error: null }; },
    then: (resolve: (value: unknown) => unknown) => {
      if (db.fail) return Promise.resolve(resolve({ data: null, error: { message: "down" } }));
      const data = table === "claims" ? db.claims : table === "claim_epistemics" ? db.existing : table === "source_chunks" ? db.chunks.filter((row) => ids.includes(String(row.id)))
        : table === "sources" ? db.sources.filter((row) => ids.includes(String(row.id))) : [];
      return Promise.resolve(resolve({ data, error: null }));
    } };
  return query;
} } }));
vi.mock("@/lib/corpus/onboarding", () => ({ loadPersonalityCoverage: vi.fn() }));

const person = "11111111-1111-4111-8111-111111111111";
const exact = (chunk: string) => ({ chunk_id: chunk, relationship: "supports", confidence: 1, link_method: "exact_passage", metadata: { supportLevel: "EXACT", exactMatch: true, matchedText: "x" } });
const claim = (id: string, text: string, links: Array<Record<string, unknown>>) => ({ id, claim_text: text, claim_kind: "established_fact", evidence_type: "historical_fact",
  certainty: "high", approval_origin: "corpus_evidence_review", approval_metadata: {}, parameter_field_id: null, claim_sources: [{ source_id: "s1", page_or_section: "p. 2" }], claim_chunks: links });
const stale = (id: string) => ({ claim_id: id, epistemic_type: null, type_origin: "deterministic", type_review_status: "needs_type_review", reviewer: null, reviewer_kind: null,
  review_note: null, reviewed_at: null, contract_status: "NEEDS_TYPE_REVIEW", contract_satisfied: false });

function seed() {
  db.written.length = 0; db.fail = false;
  db.sources = [{ id: "s1", title: "Record of the academy", author: "Registrar", source_type: "institutional", textual_layer: null, content_hash: "h1", metadata: {} },
    { id: "s2", title: "Another history", author: "Historian", source_type: "scholarly_book", textual_layer: null, content_hash: "h2", metadata: {} }];
  db.chunks = [{ id: "c1", source_id: "s1" }, { id: "c2", source_id: "s2" }];
  db.claims = [
    claim("blocked-with-evidence", "Anika Sen founded the Riverside Academy in 1921.", [exact("c1"), exact("c2")]),
    claim("blocked-without-evidence", "Anika Sen founded the Hill School in 1925.", []),
    claim("usable-but-weaker-now", "Anika Sen taught at the Riverside Academy.", []),
  ];
  db.existing = [stale("blocked-with-evidence"), stale("blocked-without-evidence"),
    { ...stale("usable-but-weaker-now"), epistemic_type: "HISTORICAL_FACT", type_review_status: "auto_assigned", contract_status: "SUPPORTED", contract_satisfied: true }];
}
afterEach(() => vi.unstubAllEnvs());

describe("upgrade-only epistemic refresh", () => {
  it("unblocks a claim the current rules support, and never re-blocks or rewrites anything else", async () => {
    seed();
    const { refreshBlockedEpistemics, answerUsable } = await import("@/lib/claim-epistemics/engine");
    const result = await refreshBlockedEpistemics(person);
    expect(result).toMatchObject({ evaluated: 3, blockedBefore: 2, upgraded: 1, upgradedClaimIds: ["blocked-with-evidence"] });
    expect(db.written.map((row) => row.claim_id)).toEqual(["blocked-with-evidence"]);
    expect(answerUsable(db.written[0] as never)).toBe(true);
    expect(db.written[0].contract_detail).toMatchObject({ refreshed: "upgrade-only autonomous refresh" });
    // The full reassessment would have downgraded the third claim; the refresh leaves it alone.
    db.written.length = 0;
    const { reassessEpistemics } = await import("@/lib/claim-epistemics/engine");
    await reassessEpistemics(person);
    expect(answerUsable(db.written.find((row) => row.claim_id === "usable-but-weaker-now") as never)).toBe(false);
  });
  it("runs after an answer at most once per interval per person, can be switched off, and never throws", async () => {
    seed();
    const { refreshPersonalityEpistemics, epistemicRefreshDue, resetEpistemicRefreshSchedule } = await import("@/lib/claim-epistemics/autonomous-refresh");
    resetEpistemicRefreshSchedule();
    expect(await refreshPersonalityEpistemics([person])).toEqual([{ personalityId: person, upgraded: 1 }]);
    expect(epistemicRefreshDue(person)).toBe(false);
    expect(await refreshPersonalityEpistemics([person])).toEqual([]);
    resetEpistemicRefreshSchedule();
    db.fail = true;
    expect(await refreshPersonalityEpistemics([person])).toEqual([null]);
    resetEpistemicRefreshSchedule();
    vi.stubEnv("EPISTEMIC_AUTO_REFRESH_ENABLED", "false");
    expect(epistemicRefreshDue(person)).toBe(false);
  });
});
