import { describe, expect, it } from "vitest";
import { buildExpansionQueries, strategyPenalty, strategiesExhausted, targetForGap, type Gap } from "@/lib/live-research/expansion-plan";
import { assessClaimPassage, normalizeTextReference, normalizeTransliteration, proposeDirectNameObservation, supportsStructuredRecord } from "@/lib/live-research/provenance-link";
import { scopedNavigationLinks, duplicateWorkOf, type Verification } from "@/lib/live-research/verification";
import { rankCandidateUrls } from "@/lib/live-research/candidate-ranking";
import { EXPLORATION_BUDGET, mayExploreChild } from "@/lib/live-research/exploration-policy";

const gap: Gap = { name: "Historical / Textual Context", code: "historical_context", sourceChunks: 4,
  uniqueEvidenceSources: 1, independentWorks: 1, primaryWorks: 1, scholarlyWorks: 0,
  claimsWithExactPassages: 0, approvedClaims: 5, fields: [] };

describe("source-class research planning", () => {
  it("targets scholarship when primary material exists without interpretation", () => {
    expect(targetForGap(gap).type).toBe("peer_reviewed_scholarship");
    const queries = buildExpansionQueries({ name: "Vishvamitra", aliases: ["Viśvāmitra"], gaps: [gap],
      sourceTitles: ["Rigveda Mandala 3"], relationships: ["Vasistha"], events: [], domains: [] }, 16);
    expect(new Set(queries.slice(0, 5).map((item) => item.strategy)).size).toBeGreaterThanOrEqual(4);
    expect(queries.some((item) => item.strategy === "work" && item.targetSourceType === "primary_edition")).toBe(true);
    expect(queries.every((item) => item.weaknessReason && item.expectedKnowledgeGain > 0)).toBe(true);
  });
  it("deprioritizes failed patterns without declaring all strategies saturated", () => {
    const performance = { topic: { attempts: 3, credible: 0, newWorks: 0, exactLinks: 0 } };
    expect(strategyPenalty("topic", performance)).toBe(6);
    expect(strategiesExhausted(performance)).toBe(false);
    expect(strategyPenalty("repository", performance)).toBe(0);
  });
  it("ranks likely institutional results for verification without granting trust", () => {
    expect(rankCandidateUrls(["https://blogspot.com/vedic", "https://example.edu/project/text"], "primary_edition")[0])
      .toBe("https://example.edu/project/text");
  });
});

describe("bounded project exploration", () => {
  const scope = { domain: "example.edu", path_prefix: "/project/rigveda/" };
  it("accepts only relevant HTTPS links inside the verified project path", () => {
    const html = `<a href="/project/rigveda/3/33">Sukta 33</a>
      <a href="/project/other/3/33">Sukta 33</a>
      <a href="https://evil.test/project/rigveda/3/">Mandala 3</a>
      <a href="/project/rigveda/3/34">Sukta 34</a>`;
    expect(scopedNavigationLinks(html, "https://example.edu/project/rigveda/3/", scope, ["Viśvāmitra"], 1))
      .toEqual(["https://example.edu/project/rigveda/3/33"]);
    expect(scopedNavigationLinks(html, "https://example.edu/project/other/", scope, ["Viśvāmitra"])).toEqual([]);
  });
  it("counts sections of one edition as one work, not duplicate mirrors", () => {
    const candidate = { canonical_url: "https://example.edu/project/rigveda/3/34", domain: "example.edu", independent_work_key: "rigveda|edition-a" } as Verification;
    expect(duplicateWorkOf(candidate, [{ canonical_url: "https://example.edu/project/rigveda/3/33", independent_work_key: candidate.independent_work_key }])).toBeNull();
    expect(duplicateWorkOf(candidate, [{ canonical_url: "https://mirror.edu/project/rigveda/3/33", independent_work_key: candidate.independent_work_key }])).toContain("mirror.edu");
  });
  it("enforces depth, page and run limits", () => {
    expect(mayExploreChild(0, 1, 1)).toBe(true);
    expect(mayExploreChild(EXPLORATION_BUDGET.maxLinkDepth, 1, 1)).toBe(false);
    expect(mayExploreChild(0, EXPLORATION_BUDGET.maxPagesPerQuery, 1)).toBe(false);
    expect(mayExploreChild(0, 1, EXPLORATION_BUDGET.maxPagesPerRun)).toBe(false);
  });
});

describe("conservative passage provenance", () => {
  it("normalizes Vedic references and transliteration variants", () => {
    expect(normalizeTextReference("RV 3.33")).toBe("rv:3.33");
    expect(normalizeTextReference("Ṛgveda III.33")).toBe("rv:3.33");
    expect(normalizeTextReference("Mandala 3 Sukta 33")).toBe("rv:3.33");
    expect(normalizeTextReference("Bala Kanda Sarga 22", "Ramayana")).toBe("ramayana:1.22");
    expect(normalizeTextReference("1.22.10", "Valmiki Ramayana")).toBe("ramayana:1.22.10");
    expect(normalizeTextReference("Mahabharata 3.12.4")).toBe("mahabharata:3.12.4");
    expect(normalizeTransliteration("Viśvāmitra")).toBe(normalizeTransliteration("Vishwamitra"));
  });
  it("requires matching wording as well as an exact locator for exact support", () => {
    const claim = { text: "Vishvamitra speaks to the rivers Vipasha and Shutudri", locator: "RV 3.33" };
    expect(assessClaimPassage(claim, { text: "Visvamitra speaks to the rivers Vipasha and Shutudri.", locator: "3.33.1" }, ["Vishvamitra"]).level).toBe("EXACT");
    expect(assessClaimPassage(claim, { text: "Agni receives the sacrifice.", locator: "3.33.1" }, ["Vishvamitra"]).level).not.toBe("EXACT");
    expect(assessClaimPassage(claim, { text: "Visvamitra speaks to the rivers Vipasha and Shutudri.", locator: "3.34.1" }, ["Vishvamitra"]).level).not.toBe("EXACT");
    expect(assessClaimPassage(claim, { text: "Visvamitra speaks to the rivers Vipasha and Shutudri.", locator: "3.33.1", work: "Valmiki Ramayana" }, ["Vishvamitra"]).level).not.toBe("EXACT");
  });
  it("creates only review-pending direct observations for unrepresented exact passages", () => {
    const passage = { text: "The Visvamitras have sung forth this prayer to Indra.", locator: "3.53.13", work: "Rigveda" };
    expect(proposeDirectNameObservation(passage, "Vishvamitra", ["Viśvāmitra"], new Set())).toContain("3.53.13");
    expect(proposeDirectNameObservation(passage, "Vishvamitra", ["Viśvāmitra"], new Set(["rv:3.53"]))).toBeNull();
    expect(proposeDirectNameObservation({ ...passage, locator: null }, "Vishvamitra", ["Viśvāmitra"], new Set())).toBeNull();
  });
  it("links events and relationships only with both named parties and substantive wording overlap", () => {
    const passage = "Vishvamitra addressed King Dasharatha and asked him to honor his word to support the sacred vow.";
    const description = "Vishvamitra addresses King Dasharatha, asking him to honor his word and support the sacred vow.";
    expect(supportsStructuredRecord(passage, description, ["Viśvāmitra", "Vishvamitra"], "Dasharatha")).toBe(true);
    expect(supportsStructuredRecord("Vishvamitra met Dasharatha.", description, ["Vishvamitra"], "Dasharatha")).toBe(false);
  });
});
