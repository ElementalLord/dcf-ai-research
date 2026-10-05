import { describe, expect, it } from "vitest";
import { classifyQuestionScope } from "@/lib/ask/question-scope";
import { selectBroadEvidence } from "@/lib/corpus/rerank";
import { assessEvidenceSufficiency } from "@/lib/live-research/sufficiency";
import { gapSearchQueries } from "@/lib/live-research/gap-query";
import { buildSynthesisPrompt, SYNTHESIS_PROMPT_VERSION } from "@/lib/corpus/synthesis-prompt";
import { renderExtractiveEvidence } from "@/lib/corpus/local-synthesis";
import type { Citation, RetrievedClaim, RetrievedPassage } from "@/lib/corpus/types";

function claim(id: string, parameterCode: string, text: string, sourceTitle = `Source ${id}`): RetrievedClaim {
  return { kind: "claim", id: `claim:${id}`, claimId: id, text, claimKind: "textual", certainty: "high", approvalOrigin: "imported_existing", evidenceType: "primary_text", parameterName: parameterCode, parameterCode,
    fieldLabel: parameterCode, sourceTitle, sourceAuthor: null, sourceInstitution: null, sourceUrl: null, sourceType: "primary_text", pageOrSection: null, evidenceExcerpt: null, chunkId: id, textualLayer: parameterCode };
}

describe("scope-aware grounded answers", () => {
  it("routes the exact benchmark intents without a model call", () => {
    expect(classifyQuestionScope("Who is Vishvamitra?")).toBe("BROAD_PROFILE");
    expect(classifyQuestionScope("Tell me about Vishvamitra.")).toBe("BROAD_PROFILE");
    expect(classifyQuestionScope("What are Vishvamitra's biggest contributions?")).toBe("BROAD_SIGNIFICANCE");
    expect(classifyQuestionScope("What is the biggest contribution of him?")).toBe("BROAD_SIGNIFICANCE");
    expect(classifyQuestionScope("What happened between Vishvamitra and Vasistha?")).toBe("RELATIONSHIP");
    expect(classifyQuestionScope("What was Vishvamitra's role in Rama's story?")).toBe("EXPLANATION");
    expect(classifyQuestionScope("What is the significance of Rigveda 3.33 for Vishvamitra?")).toBe("TEXT_SPECIFIC");
    expect(classifyQuestionScope("Compare Vishvamitra and Vasistha.")).toBe("COMPARISON");
  });

  it("selects coverage and rejects unlinked, off-topic passages", () => {
    const unrelated: RetrievedPassage = { kind: "passage", id: "passage:off", chunkId: "off", sourceId: "off", text: "An unrelated dynasty succeeded to the throne.", sectionTitle: null,
      pageOrSection: null, textualLayer: "epic", sourceTitle: "Chapter 9", sourceAuthor: null, sourceInstitution: null, sourceUrl: null, sourceType: "primary_text", sourceStatus: "approved" };
    const selected = selectBroadEvidence([
      claim("role-1", "role", "Rishi A is a seer in the Vedic corpus."),
      claim("role-2", "role", "Rishi A is praised as a sage in another passage."),
      claim("text", "textual_contribution", "Rishi A is linked with named hymns."),
      claim("tapas", "tapas_sadhana", "Rishi A undertakes austerities in the epic."),
      unrelated,
    ], 4, ["Rishi A"]);
    expect(selected).toHaveLength(4);
    expect(selected.map((item) => item.id)).not.toContain("passage:off");
    expect(new Set(selected.map((item) => item.kind === "claim" ? item.parameterCode : ""))).toEqual(new Set(["role", "textual_contribution", "tapas_sadhana"]));
  });

  it("requires breadth for a profile but accepts directly supported focused questions", () => {
    const thin = [claim("one", "role", "Rishi A teaches a prince."), claim("two", "role", "Rishi A guides that prince.")];
    const profile = assessEvidenceSufficiency("Who is Rishi A?", thin, { personalityAliases: ["Rishi A"], allParameters: [{ code: "role", name: "Role" }, { code: "textual_contribution", name: "Textual contribution" }] });
    expect(profile.sufficient).toBe(false);
    expect(profile.answerable).toBe(true);
    expect(profile.missingDimensions).toContain("Textual contribution");
    const focused = assessEvidenceSufficiency("What did Rishi A teach?", thin, { personalityAliases: ["Rishi A"] });
    expect(focused.answerable).toBe(true);
  });

  it("does not mistake a food episode for a favorite food", () => {
    const food = [claim("food", "tapas_sadhana", "Vishvamitra gave cooked food to a supplicant.")];
    const decision = assessEvidenceSufficiency("What was Vishvamitra's favorite food?", food, { personalityAliases: ["Vishvamitra"] });
    expect(decision.answerable).toBe(false);
    expect(decision.missingDimensions).toContain("favorite");
  });

  it("targets gaps and includes a single internal review in the synthesis prompt", () => {
    expect(gapSearchQueries("Rishi A", "What does Rigveda 3.33 say?", ["textual contribution", "lineage"]))
      .toEqual(["Rishi A textual contribution Rigveda 3.33", "Rishi A lineage Rigveda 3.33"]);
    const prompt = buildSynthesisPrompt({ personality: "Rishi A", question: "Who is Rishi A?", resolvedQuestion: "Who is Rishi A?", scope: "BROAD_PROFILE", evidenceContext: "[C1] Claim" });
    expect(SYNTHESIS_PROMPT_VERSION).toMatch(/^grounded_synthesis_/);
    expect(prompt).toContain("silently review");
    expect(prompt).toContain("using only the supplied IDs");
    expect(prompt).toContain("Evidence grounding constrains WHAT you may claim, not HOW you must phrase it.");
    expect(prompt).toContain("do not write one paragraph or bullet per source");
    expect(prompt).toContain("[C1] Claim");
    const research = buildSynthesisPrompt({ personality: "Rishi A", question: "Who is Rishi A?", resolvedQuestion: "Who is Rishi A?", scope: "BROAD_PROFILE", evidenceContext: "[C1] Claim", responseStyle: "research" });
    expect(research).toContain("More depth means more reasoning, not more excerpts");
  });

  it("shows central supported dimensions first when Gemini is unavailable", () => {
    const items = [
      claim("late", "contemporary_relevance", "Rishi A is discussed in modern reflections."),
      claim("role", "role", "Rishi A is presented as a seer."),
      claim("text", "textual_contribution", "Rishi A is linked to a named Vedic hymn."),
    ];
    const citations = items.map((item, index): Citation => ({ id: `C${index + 1}`, kind: "approved_claim", claimId: item.claimId, title: item.sourceTitle || "Claim", author: null,
      institution: null, url: null, sourceType: item.sourceType, pageOrSection: null, textualLayer: item.textualLayer, excerpt: item.text }));
    const output = renderExtractiveEvidence(items, citations, true, "BROAD_SIGNIFICANCE");
    expect(output.indexOf("named Vedic hymn")).toBeLessThan(output.indexOf("presented as a seer"));
    expect(output.indexOf("presented as a seer")).toBeLessThan(output.indexOf("modern reflections"));
  });

  it("makes a concise claim-led fallback and does not dump a long passage", () => {
    const primary = claim("role", "role", "The Ramayana portrays Rishi A as a teacher of the princes.", "Ramayana");
    const passage: RetrievedPassage = { kind: "passage", id: "passage:p", chunkId: "p", sourceId: "s", text: "The princes arrive. ".repeat(100), sectionTitle: "Episode", pageOrSection: "1.1", textualLayer: "Ramayana", sourceTitle: "Ramayana", sourceAuthor: null, sourceInstitution: null, sourceUrl: null, sourceType: "primary_text", sourceStatus: "approved" };
    const citations: Citation[] = [
      { id: "C1", kind: "approved_claim", claimId: "role", title: "Ramayana", author: null, institution: null, url: null, sourceType: "primary_text", pageOrSection: null, textualLayer: "Ramayana", excerpt: primary.text },
      { id: "S1", kind: "approved_source_passage", chunkId: "p", title: "Ramayana", author: null, institution: null, url: null, sourceType: "primary_text", pageOrSection: "1.1", textualLayer: "Ramayana", excerpt: passage.text },
    ];
    const output = renderExtractiveEvidence([primary, passage], citations, false, "RELATIONSHIP", "What role did Rishi A play?", "simple");
    expect(output).toContain("teacher of the princes");
    expect(output).toContain("[C1]");
    expect(output).not.toContain("The princes arrive");
    expect(output.length).toBeLessThan(350);
  });
});
