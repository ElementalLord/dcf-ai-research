import { describe, expect, it } from "vitest";
import { chunkSections, dedupeChunksByHash } from "@/lib/corpus/chunk";

const paragraphs = Array.from({ length: 14 }, (_, index) =>
  `Paragraph ${index + 1}. Vishvamitra passage ${index + 1} contains enough structured words to test stable boundaries and overlap without splitting the paragraph.`,
).join("\n\n");

describe("corpus chunking", () => {
  it("is deterministic, non-empty, and preserves section metadata", () => {
    const input = [{ title: "Rigveda 3.33", pageOrSection: "Hymn 3.33", text: paragraphs, metadata: { layer: "Rigveda" } }];
    const first = chunkSections(input, { targetTokens: 120, maxTokens: 180, overlapTokens: 30 });
    const second = chunkSections(input, { targetTokens: 120, maxTokens: 180, overlapTokens: 30 });
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(1);
    expect(first.every((chunk) => chunk.text.trim() && chunk.sectionTitle === "Rigveda 3.33")).toBe(true);
    expect(first.map((chunk) => chunk.contentHash)).toEqual(second.map((chunk) => chunk.contentHash));
    expect(first[1].text).toContain("Paragraph");
  });

  it("deduplicates identical chunks by stable content hash", () => {
    const chunks = chunkSections([{ text: "The same complete passage." }, { text: "The same complete passage." }]);
    expect(chunks).toHaveLength(2);
    expect(dedupeChunksByHash(chunks)).toHaveLength(1);
  });
});
