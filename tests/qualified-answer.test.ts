import { describe, expect, it } from "vitest";
import { supportsQualifiedAnswer } from "@/lib/ask/evidence-priority";
import type { RetrievedPassage } from "@/lib/corpus/types";

const passage = (id: string, text: string, url: string, supportLevel?: RetrievedPassage["supportLevel"]): RetrievedPassage => ({
  kind: "passage", id, chunkId: id, sourceId: id, text, sectionTitle: null, pageOrSection: null, textualLayer: null,
  sourceTitle: `Source ${id}`, sourceAuthor: null, sourceInstitution: null, sourceUrl: url, sourceType: "scholarly_article",
  sourceStatus: "approved", origin: "google_grounding", supportLevel,
});

const raman = "C. V. Raman";
const aliases = ["Raman", "Chandrasekhara Venkata Raman"];

describe("supportsQualifiedAnswer", () => {
  it("allows a qualified answer when research found a strongly supporting passage", () => {
    const evidence = [passage("a", "C. V. Raman studied the scattering of light and in 1928 described what became known as the Raman effect.", "https://a.example/raman", "STRONG")];
    expect(supportsQualifiedAnswer("How did Raman study light scattering?", evidence, raman, aliases, [{ requirementKey: "direct" }])).toBe(true);
  });

  it("needs two independent sources when support is only partial", () => {
    const one = [passage("a", "C. V. Raman worked at the Indian Association for the Cultivation of Science in Calcutta for many years.", "https://a.example/raman", "PARTIAL")];
    const two = [...one, passage("b", "Raman later founded the Raman Research Institute in Bangalore, where he continued his own experiments.", "https://b.example/raman", "PARTIAL")];
    expect(supportsQualifiedAnswer("Where did Raman do his research work?", one, raman, aliases, [{ requirementKey: "direct" }])).toBe(false);
    expect(supportsQualifiedAnswer("Where did Raman do his research work?", two, raman, aliases, [{ requirementKey: "direct" }])).toBe(true);
  });

  it("never relaxes precision questions such as dates, comparisons or contested claims", () => {
    const evidence = [passage("a", "C. V. Raman studied the scattering of light and in 1928 described what became known as the Raman effect.", "https://a.example/raman", "STRONG")];
    for (const requirementKey of ["date", "comparison", "contested", "current"]) {
      expect(supportsQualifiedAnswer("When exactly did Raman discover the effect?", evidence, raman, aliases, [{ requirementKey }])).toBe(false);
    }
    expect(supportsQualifiedAnswer("Did Raman deserve the prize?", evidence, raman, aliases, [{ requirementKey: "direct", contested: true }])).toBe(false);
  });

  it("does not count passages about someone else or rejected sources", () => {
    const other = [passage("a", "Homi Bhabha led the Tata Institute of Fundamental Research and shaped India's nuclear programme for decades.", "https://a.example/bhabha")];
    const rejected = [{ ...passage("b", "C. V. Raman studied the scattering of light and described the Raman effect in 1928.", "https://b.example/raman", "STRONG"), sourceStatus: "rejected" }];
    expect(supportsQualifiedAnswer("How did Raman study light scattering?", other, raman, aliases, [{ requirementKey: "direct" }])).toBe(false);
    expect(supportsQualifiedAnswer("How did Raman study light scattering?", rejected, raman, aliases, [{ requirementKey: "direct" }])).toBe(false);
  });
});
