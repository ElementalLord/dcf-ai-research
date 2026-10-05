import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { answerQuestion } from "@/lib/corpus/answer";
import { retrieveEvidence } from "@/lib/corpus/retrieval";
import { checkpointedAi } from "@/lib/corpus/ai-checkpoints";
import { alternateGenerationCircuit, generationCircuit } from "@/lib/corpus/provider-health";
import { recordAiCall, withRequestUsage } from "@/lib/corpus/usage";

const state = vi.hoisted(() => ({
  caches: new Map<string, Record<string, unknown>>(), checkpoints: new Map<string, Record<string, unknown>>(),
  claims: [] as Record<string, unknown>[], chunks: [] as Record<string, unknown>[],
  sequence: [] as string[], rulesActive: true, started: [] as string[], finished: [] as string[], vectorRpc: vi.fn(), fetch: vi.fn(), discover: vi.fn(), generate: vi.fn(), embed: vi.fn(),
}));
vi.mock("@/lib/corpus/personality-context", () => ({ loadPersonalityConfiguration: vi.fn(async () => ({ personalityId: "p", canonicalName: "Vishvamitra", categoryId: "category", categorySlug: "rishi", categoryName: "Rishis", aliases: [{ alias: "Vishwamitra" }], termAliases: [] })) }));
vi.mock("@/lib/corpus/embeddings", () => ({ embedTexts: state.embed }));
vi.mock("@google/genai", () => ({ ThinkingLevel: { LOW: "LOW" }, GoogleGenAI: class { models = { generateContent: state.generate }; } }));
vi.mock("@/lib/live-research/source-registry", () => ({ loadActiveSourceRules: vi.fn(async () => [{ id: "rule", is_active: true, allow_live_fetch: true, evidence_use_status: "approved", display_name: "Public primary text" }]) }));
vi.mock("@/lib/live-research/live-search", () => ({ discoverApprovedUrls: state.discover }));
vi.mock("@/lib/live-research/cache", () => ({ fetchAndCacheApprovedPage: state.fetch }));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: {
  from: (table: string) => builder(table), rpc: (name: string) => builder(name),
} }));
function builder(table: string) {
  let id = "";
  let values: Record<string, unknown> | undefined;
  const query = {
    select: () => query, eq: (column: string, value: string) => { if (column === "id") id = value; return query; },
    in: () => query, limit: () => query, order: () => query, or: () => query, gt: () => query,
    maybeSingle: () => query, upsert: (value: Record<string, unknown>) => { values = value; return query; },
    then: (resolve: (value: { data: unknown; error: null; count?: number }) => unknown) => {
      state.started.push(table); state.sequence.push(`start:${table}`);
      return new Promise((done) => setTimeout(() => {
        let data: unknown = [];
        if (table === "parameters") data = [{ id: "role", code: "role", name: "Role", routing_hints: ["role"], parameter_fields: [] }];
        if (table === "claims") data = state.claims;
        if (table === "approved_source_access") data = !state.rulesActive ? [] : [{ id: "rule", is_active: true, domain: "example.test", scope_type: "DOMAIN", include_subdomains: false, allow_live_fetch: true, evidence_use_status: "approved" }];
        if (table === "search_source_chunks_lexical") data = state.chunks;
        if (table === "get_retrieval_inventory") data = { approvedEmbeddingCountForPersonality: 1 };
        if (table === "answer_cache" || table === "ai_work_checkpoints") {
          const store = table === "answer_cache" ? state.caches : state.checkpoints;
          if (values) { const key = String(values.id); store.set(key, { ...store.get(key), ...values }); }
          data = store.get(id) || null;
        }
        if (table === "search_source_chunks_vector") { state.vectorRpc(); data = []; }
        state.finished.push(table); state.sequence.push(`finish:${table}`);
        done(resolve({ data, error: null, count: table === "claims" ? state.claims.length : 1 }));
      }, 1));
    },
  };
  return query;
}
function claim(id: string, text: string, parameter = "Role") {
  return { id, claim_text: text, claim_kind: "traditional_account", certainty: "medium", review_status: "approved", approval_origin: "human_manual", evidence_type: "traditional_narrative", parameter_fields: { id, label: "Role", parameters: { id, name: parameter, sort_order: 1 } }, claim_sources: [{ sources: { id: "source", title: "Public primary text", source_status: "approved", source_type: "primary_text" } }], claim_chunks: [] };
}
function passage(text: string) {
  return { chunk_id: "chunk", source_id: "source", chunk_text: text, source_title: "Approved Ramayana", source_url: "https://example.test/approved", source_status: "approved", lexical_score: 1, textual_layer: "Epic narrative", source_type: "primary_text", metadata: { origin: "live_cache" } };
}
beforeEach(() => {
  state.caches.clear(); state.checkpoints.clear(); state.started.length = 0; state.finished.length = 0; state.sequence.length = 0; state.rulesActive = true;
  state.chunks = [];
  state.claims = [claim("one", "The text portrays Vishvamitra as Rama's guide."), claim("two", "The narrative describes his tapas.", "Tapas"), claim("three", "The family is associated with Rigveda hymns.", "Textual contribution")];
  state.discover.mockResolvedValue({ accepted: [], rejected: [], approvedSourcesConsidered: [] });
  state.embed.mockRejectedValue(new Error("429 embedding quota exhausted"));
  generationCircuit.succeed();
  alternateGenerationCircuit.succeed();
  vi.stubEnv("SYNTHESIS_PROVIDER", "extractive");
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); generationCircuit.succeed(); alternateGenerationCircuit.succeed(); });

describe("Ask orchestration", () => {
  it("answers a broad question and Rama follow-up without generative calls", async () => {
    const broad = await answerQuestion("Who is Vishwamitra?", "p");
    expect(broad.status).toBe("extractive_fallback");
    expect(broad.answer).toContain("Vishvamitra as Rama's guide");
    expect(broad.answer).not.toContain("Relevant verified evidence");
    expect(broad.debug.generativeCalls).toBe(0);
    expect(broad.resolvedQuestion).toBe("Who is Vishvamitra?");
    const rama = await answerQuestion("What role did he play in Rama's story?", "p");
    expect(rama.status).toBe("extractive_fallback");
    expect(rama.answer).toContain("Rama's guide");
    expect(rama.citations.length).toBeGreaterThan(0);
    expect(state.generate).not.toHaveBeenCalled();
  });
  it("abstains on unsupported favorite food without generation", async () => {
    const result = await answerQuestion("What was Vishvamitra's favorite food?", "p");
    expect(result.status).toBe("abstained");
    expect(result.citations).toEqual([]);
    expect(result.debug.generativeCalls).toBe(0);
  });
  it("starts independent local queries before any of them finish", async () => {
    await retrieveEvidence("Who is Vishvamitra?", "p");
    const firstStart = state.sequence.indexOf("start:claims");
    const firstFinish = state.sequence.findIndex((event, index) => index > firstStart && event.startsWith("finish:"));
    expect(state.sequence.slice(firstStart, firstFinish)).toEqual(expect.arrayContaining(["start:claims", "start:get_retrieval_inventory", "start:approved_source_access", "start:events", "start:relationships"]));
  });
  it("continues lexical retrieval after query embedding failure", async () => {
    state.claims = []; state.chunks = [passage("Vishvamitra teaches Rama.")];
    const result = await answerQuestion("What role did Vishvamitra play in Rama's story?", "p");
    expect(state.embed).toHaveBeenCalled();
    expect(state.vectorRpc).not.toHaveBeenCalled();
    expect(result.status).toBe("extractive_fallback");
    expect(result.debug.semanticFallbackReason).toContain("query_embedding_failed");
    expect(result.answer).toContain("teaches Rama");
  });
  it("does approved live fetch/cache and re-retrieval with no synthesis", async () => {
    state.claims = []; state.chunks = [];
    state.discover.mockResolvedValue({ accepted: ["https://example.test/approved"], rejected: [{ url: "https://unapproved.test/", reason: "SOURCE_NOT_APPROVED" }], approvedSourcesConsidered: ["Primary text"] });
    state.fetch.mockImplementation(async () => { state.chunks = [passage("Vishvamitra teaches Rama Bala and Atibala.")]; return { cacheHit: false }; });
    const result = await answerQuestion("Who taught Rama Bala and Atibala?", "p");
    expect(result.status).toBe("extractive_fallback");
    expect(result.debug.liveResearchTriggered).toBe(true);
    expect(result.debug.liveFetches).toBe(1);
    expect(result.debug.liveUrlsRejected).toHaveLength(1);
    expect(result.citations[0].chunkId).toBe("chunk");
    expect(result.debug.generativeCalls).toBe(0);
  });
  it("writes synthesized answers and reuses normalized repeat with zero generation", async () => {
    vi.stubEnv("GEMINI_API_KEY", "fake"); vi.stubEnv("SYNTHESIS_PROVIDER", "gemini");
    state.generate.mockImplementation(async () => ({ text: "The approved text portrays a guide [C1]." }));
    const first = await answerQuestion("Who is Vishvamitra?", "p");
    expect(first.status).toBe("complete"); expect(first.debug.generativeCalls).toBe(1);
    expect(state.caches.size).toBe(1);
    const repeated = await answerQuestion("who is vishvamitra", "p");
    expect(repeated.debug.answerCacheHit).toBe(true);
    expect(repeated.debug.generativeCalls).toBe(0);
    expect(repeated.answer).toBe(first.answer);
    state.claims[0] = claim("one", "Updated approved guide evidence.");
    const changed = await answerQuestion("Who is Vishvamitra?", "p");
    expect(changed.debug.answerCacheHit).toBe(false);
    expect(state.generate).toHaveBeenCalledTimes(2);
  });
  it("drops cached live evidence when its authorization is revoked", async () => {
    state.claims = []; state.chunks = [passage("Vishvamitra teaches Rama.")];
    state.rulesActive = false;
    const result = await answerQuestion("What role did Vishvamitra play in Rama's story?", "p");
    expect(result.status).toBe("abstained");
    expect(result.debug.cacheResults).toBe(0);
    expect(result.debug.answerCacheHit).toBe(false);
  });
  it("falls back on quota and skips the next provider attempt during cooldown", async () => {
    vi.stubEnv("GEMINI_API_KEY", "fake"); vi.stubEnv("SYNTHESIS_PROVIDER", "gemini");
    state.generate.mockRejectedValue(new Error("429 quota exhausted"));
    const first = await answerQuestion("Who is Vishvamitra?", "p");
    expect(first.status).toBe("extractive_fallback");
    expect(first.debug.synthesisErrorCategory).toBe("QUOTA_EXHAUSTED");
    expect(first.debug.generativeCalls).toBe(1);
    const second = await answerQuestion("Who is Vishvamitra?", "p");
    expect(second.status).toBe("extractive_fallback"); expect(second.debug.generativeCalls).toBe(0);
    expect(second.debug.providerCircuitOpen).toBe(true);
    expect(state.generate).toHaveBeenCalledTimes(1);
  });
  it("uses one alternate synthesis call after a transient primary 503", async () => {
    vi.stubEnv("GEMINI_API_KEY", "fake"); vi.stubEnv("SYNTHESIS_PROVIDER", "gemini");
    state.generate.mockRejectedValueOnce(new Error("503 high demand")).mockResolvedValueOnce({ text: "The approved text portrays a guide [C1]." });
    const result = await answerQuestion("Who is Vishvamitra?", "p");
    expect(result.status).toBe("complete");
    expect(result.debug.generativeCalls).toBe(2);
    expect(result.debug.model).toBe("gemini-3.5-flash-lite");
    expect(state.generate.mock.calls.map(([request]) => request.model)).toEqual(["gemini-3.7-flash", "gemini-3.5-flash-lite"]);
    expect(result.debug.extractiveFallbackUsed).toBe(false);
    state.generate.mockClear();
    state.generate.mockResolvedValue({ text: "The approved text portrays a guide [C1]." });
    const next = await answerQuestion("Tell me about Vishvamitra.", "p");
    expect(next.status).toBe("complete");
    expect(next.debug.generativeCalls).toBe(1);
    expect(state.generate.mock.calls.map(([request]) => request.model)).toEqual(["gemini-3.5-flash-lite"]);
  });
  it("does not retry an invalid citation on the alternate model", async () => {
    vi.stubEnv("GEMINI_API_KEY", "fake"); vi.stubEnv("SYNTHESIS_PROVIDER", "gemini");
    state.generate.mockResolvedValue({ text: "An invented reference [C99]." });
    const result = await answerQuestion("Who is Vishvamitra?", "p");
    expect(result.status).toBe("extractive_fallback");
    expect(result.debug.synthesisErrorCategory).toBe("CITATION_VALIDATION");
    expect(state.generate).toHaveBeenCalledTimes(1);
  });
  it("does not try the alternate model for a malformed provider request", async () => {
    vi.stubEnv("GEMINI_API_KEY", "fake"); vi.stubEnv("SYNTHESIS_PROVIDER", "gemini");
    state.generate.mockRejectedValue(Object.assign(new Error('{"error":{"code":400,"status":"INVALID_ARGUMENT"}}'), { status: 400 }));
    const result = await answerQuestion("Who is Vishvamitra?", "p");
    expect(result.status).toBe("extractive_fallback");
    expect(result.debug.synthesisErrorCategory).toBe("INVALID_REQUEST");
    expect(state.generate).toHaveBeenCalledTimes(1);
  });
  it("falls back rather than rendering fabricated citation IDs", async () => {
    vi.stubEnv("GEMINI_API_KEY", "fake"); vi.stubEnv("SYNTHESIS_PROVIDER", "gemini");
    state.generate.mockResolvedValue({ text: "Invented citation [C99]." });
    const result = await answerQuestion("Who is Vishvamitra?", "p");
    expect(result.status).toBe("extractive_fallback");
    expect(result.answer).not.toContain("C99");
    expect(state.caches.size).toBe(0);
  });
});

describe("ingestion checkpoints", () => {
  it("retains completed work across quota failure and resumes the failed unit", async () => {
    const generate = vi.fn().mockResolvedValueOnce({ claims: ["first"] }).mockRejectedValueOnce(new Error("429 quota exhausted")).mockResolvedValueOnce({ claims: ["second"] });
    const apply = vi.fn();
    await checkpointedAi("extract", "first", generate, apply);
    await expect(checkpointedAi("extract", "second", generate, apply)).rejects.toThrow("quota");
    expect([...state.checkpoints.values()].map((row) => row.status)).toEqual(["complete", "failed_quota"]);
    await checkpointedAi("extract", "first", generate, apply);
    expect(generate).toHaveBeenCalledTimes(2);
    await checkpointedAi("extract", "second", generate, apply);
    expect(generate).toHaveBeenCalledTimes(3);
    expect([...state.checkpoints.values()].every((row) => row.status === "complete")).toBe(true);
  });
  it("reuses saved model output when applying proposals was interrupted", async () => {
    const generate = vi.fn(async () => ({ claims: ["saved"] }));
    await expect(checkpointedAi("extract", "chunk", generate, async () => { throw new Error("503 database unavailable"); })).rejects.toThrow();
    const apply = vi.fn();
    await checkpointedAi("extract", "chunk", generate, apply);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith({ claims: ["saved"] });
  });
  it("keeps overlapping request call budgets isolated", async () => {
    const results = await Promise.all([1, 2].map(() => withRequestUsage(async (usage) => {
      recordAiCall("generativeCalls");
      await Promise.resolve();
      expect(usage.generativeCalls).toBe(1);
      return usage.generativeCalls;
    })));
    expect(results).toEqual([1, 1]);
  });
});
