import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderCircuit, classifyProviderError, boundedProviderCall, generationCircuit, alternateGenerationCircuit } from "@/lib/corpus/provider-health";
import { canonicalizeQuestion } from "@/lib/corpus/personality-config";
import { normalizeAnswerQuestion, answerCacheIdentity } from "@/lib/corpus/answer-cache";
import { ExtractiveSynthesisProvider, GeminiSynthesisProvider, validateAnswerCitations } from "@/lib/corpus/synthesis-provider";
import { buildBoundedContext } from "@/lib/corpus/context";
import { renderExtractiveEvidence } from "@/lib/corpus/local-synthesis";
import { assessEvidenceSufficiency } from "@/lib/live-research/sufficiency";
import { selectDiverseLayers } from "@/lib/corpus/rerank";
import { resolveQuestionContext } from "@/lib/ask/query-context";
import { checkpointFailureStatus } from "@/lib/corpus/ai-checkpoints";
import { generateText } from "@/lib/corpus/gemini";
import { recordAiCall, withRequestUsage } from "@/lib/corpus/usage";
import type { RetrievedClaim } from "@/lib/corpus/types";

const sdk = vi.hoisted(() => ({ generate: vi.fn(), interactions: vi.fn() }));
vi.mock("@google/genai", () => ({ ThinkingLevel: { LOW: "LOW" }, GoogleGenAI: class { models = { generateContent: sdk.generate }; interactions = { create: sdk.interactions }; } }));
const claim: RetrievedClaim = {
  kind: "claim", id: "claim:1", claimId: "1", text: "The text portrays Vishvamitra as Rama's teacher.",
  claimKind: "traditional_account", certainty: "medium", approvalOrigin: "human_manual", evidenceType: "direct",
  parameterName: "Relationships", fieldLabel: "Teacher", sourceTitle: "Ramayana", sourceAuthor: null,
  sourceInstitution: null, sourceUrl: "https://example.test/text", sourceType: "primary_text",
  pageOrSection: "1.1", evidenceExcerpt: null, chunkId: null, textualLayer: "Epic narrative",
};
const bounded = buildBoundedContext([claim]);
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); generationCircuit.succeed(); alternateGenerationCircuit.succeed(); vi.clearAllMocks(); });

describe("resilient synthesis", () => {
  it.each([
    [new Error("429 quota exceeded"), "QUOTA_EXHAUSTED"], [new Error("429 rate limit"), "RATE_LIMIT"],
    [new Error("429 RESOURCE_EXHAUSTED rate limit"), "QUOTA_EXHAUSTED"],
    [new Error("timeout"), "TIMEOUT"], [new Error("401 invalid API key"), "AUTH_CONFIGURATION"],
    [new Error("404 model not found"), "MODEL_UNAVAILABLE"], [new Error("503 unavailable"), "TRANSIENT"],
    [new Error("wrapper", { cause: new Error("RESOURCE_EXHAUSTED") }), "QUOTA_EXHAUSTED"],
  ])("classifies %s", (error, expected) => expect(classifyProviderError(error)).toBe(expected));
  it("treats a 503 model UNAVAILABLE response as transient provider overload", () => {
    const error = Object.assign(new Error('{"error":{"code":503,"message":"This model is experiencing high demand","status":"UNAVAILABLE"}}'), { name: "ApiError", status: 503 });
    expect(classifyProviderError(error)).toBe("TRANSIENT");
  });
  it("opens a bounded circuit and allows a later attempt", () => {
    let now = 0;
    const circuit = new ProviderCircuit(() => now);
    circuit.fail("QUOTA_EXHAUSTED");
    expect(circuit.state().open).toBe(true);
    now = 60_001;
    expect(circuit.state().open).toBe(false);
    circuit.succeed();
    expect(circuit.state().category).toBeNull();
  });
  it("makes one API attempt for quota failure, skips during cooldown, recovers later", async () => {
    vi.useFakeTimers();
    vi.stubEnv("GEMINI_API_KEY", "fake-test-key");
    sdk.generate.mockRejectedValueOnce(new Error("429 quota exhausted"));
    await expect(generateText("prompt")).rejects.toThrow("unavailable");
    await expect(generateText("prompt")).rejects.toThrow("cooldown");
    expect(sdk.generate).toHaveBeenCalledTimes(1);
    expect(sdk.interactions).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_001);
    sdk.generate.mockResolvedValueOnce({ text: "Supported [C1]" });
    await expect(generateText("prompt")).resolves.toMatchObject({ text: "Supported [C1]" });
    expect(sdk.generate).toHaveBeenCalledTimes(2);
    expect(sdk.generate.mock.calls[0][0].config.httpOptions.retryOptions.attempts).toBe(1);
    expect(sdk.generate.mock.calls[0][0].config.httpOptions).not.toHaveProperty("timeout"); // Gemini rejects transport deadline headers under 10s; AbortSignal owns our short timeout.
  });
  it("aborts a timed out request", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const call = boundedProviderCall((value) => { signal = value; return new Promise(() => {}); }, 100);
    const assertion = expect(call).rejects.toThrow("timeout");
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(signal?.aborted).toBe(true);
  });
  it("moves synthesis to the alternate after the shorter interactive deadline", async () => {
    vi.useFakeTimers();
    vi.stubEnv("GEMINI_API_KEY", "fake-test-key");
    vi.stubEnv("SYNTHESIS_PROVIDER", "gemini");
    sdk.generate.mockImplementationOnce(() => new Promise(() => {}));
    sdk.generate.mockResolvedValueOnce({ text: "Supported [C1]" });
    const provider = new GeminiSynthesisProvider();
    const result = provider.generateGroundedAnswer({ prompt: "prompt", evidence: [claim], citations: bounded.citations, broad: false, diagnostics: { evidenceRecords: 1, evidenceCharacters: 100, promptCharacters: 100, estimatedPromptTokens: 25 } });
    await vi.advanceTimersByTimeAsync(12_000);
    await expect(result).resolves.toMatchObject({ text: "Supported [C1]" });
    expect(sdk.generate).toHaveBeenCalledTimes(2);
  });
  it("enforces the interactive generation budget and counts embeddings separately", async () => {
    await withRequestUsage(async (usage) => {
      recordAiCall("generativeCalls"); recordAiCall("embeddingCalls");
      expect(() => recordAiCall("generativeCalls")).toThrow("budget");
      expect(usage).toMatchObject({ generativeCalls: 1, embeddingCalls: 1 });
    });
  });
  it("offers a replaceable local provider without a key", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(new GeminiSynthesisProvider().isConfigured()).toBe(false);
    const provider = new ExtractiveSynthesisProvider();
    expect(provider.isConfigured()).toBe(true);
    const output = await provider.generateGroundedAnswer({ prompt: "", evidence: [claim], citations: bounded.citations, broad: false });
    expect(output.text).toContain(claim.text);
    expect(output.text).toContain("[C1]");
    expect(sdk.generate).not.toHaveBeenCalled();
  });
  it("can disable synthesis without deleting credentials", () => {
    vi.stubEnv("GEMINI_API_KEY", "fake"); vi.stubEnv("SYNTHESIS_PROVIDER", "gemini"); vi.stubEnv("SYNTHESIS_DISABLED", "true");
    expect(new GeminiSynthesisProvider().isConfigured()).toBe(false);
  });
  it("rejects fabricated or missing citations", () => {
    expect(validateAnswerCitations("Supported [C1]", bounded.citations)).toBe(true);
    expect(validateAnswerCitations("Supported [C1] invented [C99]", bounded.citations)).toBe(false);
    expect(validateAnswerCitations("Uncited answer", bounded.citations)).toBe(false);
    expect(validateAnswerCitations("Real [C1] grouped [C1, C99]", bounded.citations)).toBe(false);
  });
  it("preserves modern and primary textual layers in comparative evidence", () => {
    const evidence = [claim, { ...claim, id: "claim:2", claimId: "2" }, { ...claim, id: "claim:3", claimId: "3", textualLayer: "Modern interpretation", sourceTitle: "Modern source" }];
    expect(selectDiverseLayers(evidence, 2).map((item) => item.textualLayer)).toEqual(["Epic narrative", "Modern interpretation"]);
  });
  it("summarizes broad evidence and collapses duplicate propositions", () => {
    const second = { ...claim, id: "claim:2", claimId: "2", text: "The text associates the family with hymns.", parameterName: "Textual contribution" };
    const all = [claim, claim, second];
    const context = buildBoundedContext(all);
    const output = renderExtractiveEvidence(context.selected, context.citations, true);
    expect(output).not.toContain("### Relevant verified evidence");
    expect(output).toContain("The text associates the family with hymns.");
    expect(output.split(claim.text)).toHaveLength(2);
    expect(output).toContain("[C1]");
  });
});

describe("conservative cache and question context", () => {
  it("matches case, whitespace and trailing question marks", () => {
    expect(normalizeAnswerQuestion(" Who is Vishvamitra? ")).toBe(normalizeAnswerQuestion("who is vishvamitra"));
    expect(normalizeAnswerQuestion("Rigveda 3.33?")).not.toBe(normalizeAnswerQuestion("Rigveda 3 33?"));
  });
  it("does not combine a claim about visiting Mithila with unrelated America passages", () => {
    const local = { ...claim, text: "Vishvamitra visits Mithila." };
    const unrelated = { kind: "passage" as const, id: "p", chunkId: "p", sourceId: "s", text: "People visit America.", sourceTitle: "Book", sectionTitle: null, pageOrSection: null, textualLayer: "Modern", sourceAuthor: null, sourceInstitution: null, sourceUrl: null, sourceType: null, sourceStatus: "approved", origin: "live_cache" as const, lexicalScore: 1 };
    expect(assessEvidenceSufficiency("Did Vishvamitra visit America?", [local, unrelated], { personalityAliases: ["Vishvamitra"] }).sufficient).toBe(false);
  });
  it("invalidates changed content, approval origin, policy and scope", () => {
    const key = (evidence: RetrievedClaim[], scope = ["person"], policy = "strict") => answerCacheIdentity(scope, "Question?", policy, evidence, buildBoundedContext(evidence).citations).key;
    const original = key([claim]);
    expect(key([{ ...claim, text: "Updated text" }])).not.toBe(original);
    expect(key([{ ...claim, approvalOrigin: "system_test_bulk" }])).not.toBe(original);
    expect(key([claim], ["other"])).not.toBe(original);
    expect(key([claim], ["person"], "test")).not.toBe(original);
    expect(key([])).not.toBe(original);
  });
  it("canonicalizes database personality aliases preserving references and quoted text", () => {
    const aliases = ["Vishwamitra", "Visvamitra", "Viśvāmitra"].map((alias) => ({ alias, canonicalTerm: "Vishvamitra" }));
    expect(canonicalizeQuestion('Viśvāmitra and Rigveda 3.33? "Visvamitra"', aliases)).toBe('Vishvamitra and Rigveda 3.33? "Visvamitra"');
    expect(canonicalizeQuestion("Vishwamitra?", aliases)).toBe("Vishvamitra?");
  });
  it.each(["he", "him", "she", "her", "his", "their"])("resolves %s with one selected personality", (pronoun) => {
    expect(resolveQuestionContext(`What about ${pronoun}?`, ["Vishvamitra"]).resolvedQuestion).toContain("Vishvamitra");
  });
  it.each([["429 quota", "failed_quota"], ["timeout", "failed_transient"], ["401", "failed_permanent"]])("checkpoints %s", (message, status) => {
    expect(checkpointFailureStatus(new Error(message))).toBe(status);
  });
});
