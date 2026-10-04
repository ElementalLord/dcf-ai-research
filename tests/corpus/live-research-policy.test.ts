import { describe, expect, it } from "vitest";
import { buildBoundedContext, DEFAULT_MAX_CONTEXT_CHARACTERS, DEFAULT_MAX_EVIDENCE } from "@/lib/corpus/context";
import type { RetrievedPassage } from "@/lib/corpus/types";
import { assessEvidenceSufficiency as assessEvidenceSufficiencyRaw } from "@/lib/live-research/sufficiency";
import { isFreshCacheRecord } from "@/lib/live-research/cache-policy";

function assessEvidenceSufficiency(...args: Parameters<typeof assessEvidenceSufficiencyRaw>) {
  return assessEvidenceSufficiencyRaw(args[0], args[1], {
    personalityAliases: ["Vishvamitra", "Vishwamitra", "Visvamitra"],
    termAliases: [],
    ...(args[2] || {}),
  });
}

function passage(index: number, text: string, layer = "VEDIC"): RetrievedPassage {
  return { kind: "passage", id: `passage:${index}`, chunkId: `${index}`, sourceId: `source:${index % 3}`, text,
    sectionTitle: null, pageOrSection: null, textualLayer: layer, sourceTitle: `Source ${index}`, sourceAuthor: null,
    sourceInstitution: null, sourceUrl: null, sourceType: "primary", sourceStatus: "approved", lexicalScore: 1 };
}

describe("local-first and scale policies", () => {
  it("keeps supported local questions in FAST mode and escalates unsupported ones", () => {
    const supported = assessEvidenceSufficiency("Who taught Rama Bala and Atibala?", [passage(1, "Vishvamitra taught Rama the disciplines Bala and Atibala.", "EPIC")]);
    expect(supported.sufficient).toBe(true);
    expect(supported.mode).toBe("FAST");
    const unsupported = assessEvidenceSufficiency("What was Vishvamitra's favorite food?", []);
    expect(unsupported.sufficient).toBe(false);
    expect(unsupported.mode).toBe("EXPANDED");
  });

  it("does not confuse whole-book topical hits with evidence about the selected figure", () => {
    expect(assessEvidenceSufficiency("What was Vishvamitra's height?", [{ ...passage(1, "The poet ascends to spiritual heights.", "Modern interpretation"), origin: "live_cache" }]).sufficient).toBe(false);
    expect(assessEvidenceSufficiency("Did Vishvamitra invent algebra?", [{ ...passage(2, "Other traditions invent algebra.", "Modern interpretation"), origin: "live_cache" }]).sufficient).toBe(false);
    expect(assessEvidenceSufficiency("Did Vishvamitra visit America?", [{ ...passage(3, "Modern readers visit America.", "Modern interpretation"), origin: "live_cache" }]).sufficient).toBe(false);
  });

  it("does not mistake a Bala Kanda mention for evidence that Bala and Atibala were taught", () => {
    const decision = assessEvidenceSufficiency("Who taught Rama Bala and Atibala?", [
      passage(1, "Vishvamitra is a major character in the Bala Kanda of the Ramayana.", "EPIC"),
    ]);
    expect(decision.sufficient).toBe(false);
  });

  it("requires multiple textual layers for a Rigveda/Ramayana comparison", () => {
    const decision = assessEvidenceSufficiency("How does the Rigvedic Vishvamitra differ from the Vishvamitra in the Ramayana?", [passage(1, "Rigvedic hymn evidence", "VEDIC")]);
    expect(decision.sufficient).toBe(false);
    expect(decision.mode).toBe("RESEARCH");
  });

  it("treats Vasistha transliteration variants as the same retrieval concept", () => {
    const decision = assessEvidenceSufficiency("Explain Vishvamitra's relationship with Vasistha.", [
      passage(1, "Vishvamitra bargains with Sage Vashishta for Shabala, and Vashishta refuses.", "EPIC"),
    ], {
      personalityAliases: ["Vishvamitra", "Vishwamitra", "Visvamitra"],
      termAliases: [
        { canonicalTerm: "vasistha", alias: "vasistha" },
        { canonicalTerm: "vasistha", alias: "vashishta" },
      ],
    });
    expect(decision.sufficient).toBe(true);
  });

  it("treats disagreement wording as relationship intent after subjects are resolved", () => {
    const decision = assessEvidenceSufficiency("Why did Vishvamitra and Vasistha disagree?", [
      passage(1, "Vishvamitra bargains with Sage Vashishta for Shabala, and Vashishta refuses.", "EPIC"),
    ], {
      personalityAliases: ["Vishvamitra", "Vishwamitra", "Visvamitra"],
      termAliases: [
        { canonicalTerm: "vasistha", alias: "vasistha" },
        { canonicalTerm: "vasistha", alias: "vashishta" },
      ],
    });
    expect(decision.sufficient).toBe(true);
  });

  it("recognizes direct Rama, textual-legacy, and Rigveda evidence without over-demanding wording", () => {
    expect(assessEvidenceSufficiency("What role did Vishvamitra play in Rama's story?", [
      passage(1, "Vishvamitra serves as Rama's ascetic teacher and guide.", "EPIC"),
    ]).sufficient).toBe(true);
    expect(assessEvidenceSufficiency("What are Vishvamitra's major textual contributions?", [
      passage(2, "His distinctive textual legacy includes the Third Mandala tradition.", "VEDIC"),
    ]).sufficient).toBe(true);
    expect(assessEvidenceSufficiency("What is the significance of Rigveda 3.33 in relation to Vishvamitra?", [
      passage(3, "Rigveda 3.33 contains the river dialogue associated with Vishvamitra.", "VEDIC"),
    ]).sufficient).toBe(true);
  });

  it("accepts exactly two-thirds concept coverage without rounding it below the threshold", () => {
    const result = assessEvidenceSufficiency("Are all references to Vishvamitra about the same figure?", [
      passage(1, "Vishvamitra is the same name across textual layers.", "Rigveda"),
    ]);
    expect(result.coverage).toBe(2 / 3);
    expect(result.sufficient).toBe(true);
  });

  it("uses source and layer metadata for corpus-level and cross-layer questions", () => {
    expect(assessEvidenceSufficiency("What evidence links Vishvamitra to Rigveda Mandala 3?", [
      passage(1, "This hymn is attributed to the family of the named seer.", "Rigveda — Mandala 3"),
    ]).sufficient).toBe(true);

    const comparison = assessEvidenceSufficiency(
      "How does the Rigvedic Vishvamitra differ from the Vishvamitra portrayed in the Ramayana?",
      [
        passage(1, "The hymn presents a seer speaking with rivers.", "Rigveda — Mandala 3"),
        passage(2, "The epic presents a royal ascetic guiding Rama.", "Ramayana — Bala Kanda"),
      ],
    );
    expect(comparison.sufficient).toBe(true);
    expect(comparison.mode).toBe("FAST");
  });

  it("does not require intent verbs when the requested facts are covered", () => {
    expect(assessEvidenceSufficiency("Trace Vishvamitra's development from king to Brahmarshi.", [
      passage(1, "The narrative begins with King Kaushika.", "Ramayana — Bala Kanda"),
      passage(2, "Vasistha later acknowledges him as a Brahmarshi.", "Ramayana — Bala Kanda"),
    ]).sufficient).toBe(true);
    expect(assessEvidenceSufficiency("How did Vishvamitra's tapas evolve?", [
      passage(3, "Vishvamitra renews increasingly severe tapas after each interruption.", "Ramayana — Bala Kanda"),
    ]).sufficient).toBe(true);
  });

  it("uses a valid cache record and expires it deterministically", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(isFreshCacheRecord({ fetch_status: "ready", source_id: "s", expires_at: "2026-01-02T00:00:00Z" }, now)).toBe(true);
    expect(isFreshCacheRecord({ fetch_status: "ready", source_id: "s", expires_at: "2025-12-31T00:00:00Z" }, now)).toBe(false);
  });

  it("bounds final evidence and context with five thousand candidates", () => {
    const evidence = Array.from({ length: 5_000 }, (_, index) => passage(index, `Evidence ${index} ${"text ".repeat(400)}`));
    const result = buildBoundedContext(evidence);
    expect(result.selected.length).toBeLessThanOrEqual(DEFAULT_MAX_EVIDENCE);
    expect(result.context.length).toBeLessThanOrEqual(DEFAULT_MAX_CONTEXT_CHARACTERS);
    expect(result.selected.length).toBeGreaterThan(0);
  });
});
