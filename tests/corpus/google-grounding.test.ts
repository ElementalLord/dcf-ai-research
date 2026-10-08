import { afterEach, describe, expect, it, vi } from "vitest";
import { credibleGroundingUrl, groundedPassages, searchWithGoogleGrounding } from "@/lib/live-research/google-grounding";
import { googleGroundingCircuit } from "@/lib/corpus/provider-health";

const state = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@google/genai", () => ({ GoogleGenAI: class { models = { generateContent: state.generate }; } }));
afterEach(() => { googleGroundingCircuit.succeed(); vi.unstubAllEnvs(); state.generate.mockReset(); });

describe("Google grounding admission", () => {
  it("only admits supported statements from recognized credible sources", () => {
    const result = groundedPassages({ candidates: [{ groundingMetadata: {
      groundingChunks: [
        { web: { uri: "https://www.britannica.com/biography/Vishvamitra", title: "Vishvamitra | Britannica" } },
        { web: { uri: "https://random-blog.example/vishvamitra", title: "Story" } },
      ],
      groundingSupports: [
        { segment: { text: "The Ramayana portrays Vishvamitra as a sage who guides Rama." }, groundingChunkIndices: [0, 1] },
        { segment: { text: "This unsupported statement has no source mapping." }, groundingChunkIndices: [] },
      ],
    } }] }, "person", "Vishvamitra");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ origin: "google_grounding", sourceStatus: "discovered", sourceTitle: "Vishvamitra | Britannica" });
    expect(result[0].text).toContain("Ramayana portrays");
  });
  it("rejects unsafe or low-quality source URLs", () => {
    expect(credibleGroundingUrl("http://www.britannica.com/a")).toBeNull();
    expect(credibleGroundingUrl("https://quora.com/a")).toBeNull();
    expect(credibleGroundingUrl("https://www.britannica.com@internal.invalid/a")).toBeNull();
  });
  it("backs off after quota exhaustion and retries when the cooldown ends", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    state.generate.mockRejectedValueOnce(new Error("429 RESOURCE_EXHAUSTED"));
    state.generate.mockResolvedValue({ candidates: [] });
    const first = await searchWithGoogleGrounding("quota test", "person", "Vishvamitra");
    const skipped = await searchWithGoogleGrounding("different question", "person", "Vishvamitra");
    expect(first).toMatchObject({ requests: 1, errorCategory: "QUOTA_EXHAUSTED" });
    expect(skipped).toMatchObject({ requests: 0, errorCategory: "QUOTA_EXHAUSTED_COOLDOWN" });
    expect(state.generate).toHaveBeenCalledTimes(1);
    googleGroundingCircuit.succeed();
    const retried = await searchWithGoogleGrounding("different question", "person", "Vishvamitra");
    expect(retried.requests).toBe(1);
    expect(state.generate).toHaveBeenCalledTimes(2);
  });
});
