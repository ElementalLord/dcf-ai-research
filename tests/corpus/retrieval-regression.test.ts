import { describe, expect, it } from "vitest";
import { diversifyBroadEvidence, rankApprovedClaims, shouldUseSemanticRetrieval } from "@/lib/corpus/retrieval";
import { modelRerankEnabled } from "@/lib/corpus/rerank";
import type { RetrievedPassage } from "@/lib/corpus/types";
import { lexicalSearchExpression, routeParameterCodes } from "@/lib/corpus/routing";

const approvedRows: Array<Record<string, unknown>> = [
  {
    id: "claim-1", claim_text: "Vishvamitra is associated with Rigvedic Mandala 3 and is portrayed as Rama's ascetic guide.",
    claim_kind: "textual_tradition", certainty: "high",
    parameter_fields: { id: "field-1", label: "Identity and role", parameters: { id: "role", code: "role", name: "Vocation" } },
    claim_sources: [{ evidence_excerpt: "Evidence", page_or_section: "Section 1", sources: { title: "Approved source", source_status: "approved" } }],
    claim_chunks: [],
  },
  {
    id: "claim-2", claim_text: "The tradition describes prolonged tapas before Brahmarshi recognition.",
    claim_kind: "traditional_account", certainty: "medium",
    parameter_fields: { id: "field-2", label: "Tapas", parameters: { id: "tapas", code: "tapas_sadhana", name: "Tapas" } },
    claim_sources: [], claim_chunks: [],
  },
];

describe("retrieval regression", () => {
  it("returns approved legacy claims for a broad Vishvamitra question without claim_chunks", () => {
    const results = rankApprovedClaims("Who is Vishvamitra?", approvedRows);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].claimId).toBe("claim-1");
  });

  it("diversifies superlative contribution questions across framework dimensions", () => {
    const results = rankApprovedClaims("What is Vishvamitra's biggest contribution?", approvedRows);
    expect(results.map((item) => item.claimId)).toEqual(expect.arrayContaining(["claim-1", "claim-2"]));
  });

  it("uses the selected framework's sort order for broad questions", () => {
    const rows = [
      { ...approvedRows[0], id: "late", parameter_fields: { id: "late-field", label: "Late", parameters: { id: "late-parameter", code: "category_specific_late", name: "Late", sort_order: 90 } } },
      { ...approvedRows[1], id: "first", parameter_fields: { id: "first-field", label: "First", parameters: { id: "first-parameter", code: "category_specific_first", name: "First", sort_order: 1 } } },
    ];
    expect(rankApprovedClaims("Who is this person?", rows)[0].claimId).toBe("first");
  });

  it("routes common questions deterministically without selecting every parameter", () => {
    const parameters = [
      { code: "role", routingHints: ["role"] },
      { code: "textual_contribution", routingHints: ["rigveda", "hymn"] },
      { code: "tapas_sadhana", routingHints: ["tapas"] },
      { code: "social_role", routingHints: ["relationship"] },
      { code: "historical_context", routingHints: ["history"] },
    ];
    expect(routeParameterCodes("What is the significance of Rigveda 3.33?", parameters)).toContain("textual_contribution");
    expect(routeParameterCodes("Who is the selected personality?", parameters)).toEqual([]);
  });

  it("preserves exact numeric references in lexical search", () => {
    expect(lexicalSearchExpression("What is significant about Rigveda 3.33?")).toContain("33");
    expect(lexicalSearchExpression("Explain the relationship with Vasistha", [], [
      { canonicalTerm: "vasistha", alias: "vasistha" },
      { canonicalTerm: "vasistha", alias: "vashishta" },
    ])).toContain("vashishta");
  });

  it("prevents one source from dominating a broad profile", () => {
    const passages = Array.from({ length: 8 }, (_, index): RetrievedPassage => ({
      kind: "passage", id: `p${index}`, chunkId: `c${index}`, sourceId: index < 6 ? "one" : `other-${index}`,
      text: `Evidence ${index}`, sectionTitle: null, pageOrSection: null, textualLayer: null,
      sourceTitle: "Source", sourceAuthor: null, sourceInstitution: null, sourceUrl: null,
      sourceType: null, sourceStatus: "approved",
    }));
    const selected = diversifyBroadEvidence(passages, 8);
    expect(selected.filter((item) => item.kind === "passage" && item.sourceId === "one")).toHaveLength(3);
    expect(selected).toHaveLength(5);
  });

  it("keeps claims matching one meaningful term for multi-concept questions", () => {
    const results = rankApprovedClaims("How did Vishvamitra's tapas evolve?", approvedRows);
    expect(results.map((item) => item.claimId)).toContain("claim-2");
  });

  it("uses semantic embeddings only as a local retrieval fallback", () => {
    expect(shouldUseSemanticRetrieval(2, 0)).toBe(false);
    expect(shouldUseSemanticRetrieval(0, 2)).toBe(false);
    expect(shouldUseSemanticRetrieval(1, 0)).toBe(true);
  });

  it("keeps model reranking opt-in so normal asks use deterministic local ranking", () => {
    expect(modelRerankEnabled(undefined)).toBe(false);
    expect(modelRerankEnabled("false")).toBe(false);
    expect(modelRerankEnabled("true")).toBe(true);
  });
});
