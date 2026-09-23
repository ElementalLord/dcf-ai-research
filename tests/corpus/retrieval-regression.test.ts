import { describe, expect, it } from "vitest";
import { diversifyBroadEvidence, rankApprovedClaims } from "@/lib/corpus/retrieval";
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

  it("routes common questions deterministically without selecting every parameter", () => {
    const codes = ["role", "textual_contribution", "tapas_sadhana", "social_role", "historical_context"];
    expect(routeParameterCodes("What is the significance of Rigveda 3.33?", codes)).toContain("textual_contribution");
    expect(routeParameterCodes("Who is Vishvamitra?", codes)).toEqual([]);
  });

  it("preserves exact numeric references in lexical search", () => {
    expect(lexicalSearchExpression("What is significant about Rigveda 3.33?")).toContain("33");
    expect(lexicalSearchExpression("Explain the relationship with Vasistha")).toContain("vashishta");
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
});
