import { describe, expect, it } from "vitest";
import { buildBoundedContext } from "@/lib/corpus/context";
import type { RetrievedPassage } from "@/lib/corpus/types";

function passage(index: number): RetrievedPassage {
  return {
    kind: "passage", id: `passage:${index}`, chunkId: `chunk-${index}`, sourceId: `source-${index}`,
    text: `Evidence ${index} `.repeat(600), sectionTitle: `Section ${index}`, pageOrSection: `Page ${index}`,
    textualLayer: "Ramayana", sourceTitle: `Source ${index}`, sourceAuthor: null, sourceInstitution: null,
    sourceUrl: null, sourceType: "primary_text", sourceStatus: "approved",
  };
}

describe("bounded answer context", () => {
  it("limits evidence and maps every citation to a real record", () => {
    const result = buildBoundedContext(Array.from({ length: 1000 }, (_, index) => passage(index)), 12, 18_000);
    expect(result.selected.length).toBeLessThanOrEqual(12);
    expect(result.context.length).toBeLessThanOrEqual(18_000);
    expect(result.citations).toHaveLength(result.selected.length);
    result.citations.forEach((citation, index) => {
      expect(citation.id).toBe(`S${index + 1}`);
      expect(citation.chunkId).toBe(result.selected[index].kind === "passage" ? result.selected[index].chunkId : undefined);
    });
  });
  it("removes repeated passages and keeps a broad packet compact", () => {
    const items = [passage(1), { ...passage(2), text: passage(1).text }, ...Array.from({ length: 20 }, (_, index) => passage(index + 3))];
    const result = buildBoundedContext(items, 15);
    expect(result.selected.length).toBeGreaterThan(10);
    expect(result.context.length).toBeLessThan(16_000);
    expect(result.selected.some((item) => item.id === "passage:2")).toBe(false);
  });
});
