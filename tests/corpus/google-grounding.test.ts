import { describe, expect, it } from "vitest";
import { credibleGroundingUrl, groundedPassages } from "@/lib/live-research/google-grounding";

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
});
