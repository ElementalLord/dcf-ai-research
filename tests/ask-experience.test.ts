import { describe, expect, it } from "vitest";
import { resolveQuestionContext } from "@/lib/ask/query-context";
import { abstentionMessage, SYNTHESIS_FALLBACK_INTRO, SYNTHESIS_FALLBACK_NOTICE } from "@/lib/ask/messages";
import { answerBlocks, groupCitations, inlineAnswerParts, sourceTypeLabel, type AskCitation } from "@/lib/ask/presentation";
import { isBroadSynthesisQuestion, isSubjectiveSuperlativeQuestion, routeParameterCodes } from "@/lib/corpus/routing";

const citation: AskCitation = {
  id: "S1",
  kind: "approved_source_passage",
  title: "Rigveda Mandala 3",
  author: null,
  institution: null,
  url: "https://example.test/rigveda",
  sourceType: "primary_text",
  pageOrSection: "3.33",
  textualLayer: "Rigveda",
  excerpt: "A verified passage.",
};

describe("grounded Ask query context", () => {
  it("resolves a single-personality pronoun without changing quoted text", () => {
    const resolved = resolveQuestionContext('What is the biggest contribution of him, according to "his own words"?', ["Vishvamitra"]);
    expect(resolved.resolvedQuestion).toContain("Vishvamitra");
    expect(resolved.resolvedQuestion).toContain('"his own words"');
    expect(resolved.broadSynthesis).toBe(true);
    expect(resolved.subjectiveSuperlative).toBe(true);
  });

  it("uses bounded prior questions to resolve a plural follow-up", () => {
    const resolved = resolveQuestionContext("Why did they disagree?", ["Vishvamitra"], [
      { question: "Who is Vishvamitra?", resolvedQuestion: "Who is Vishvamitra?" },
      { question: "What was his relationship with Vasistha?", resolvedQuestion: "What was Vishvamitra's relationship with Vasistha?" },
    ]);
    expect(resolved.resolvedQuestion).toBe("Why did Vishvamitra and Vasistha disagree?");
  });

  it.each([
    "Why is he important?",
    "What did he contribute?",
    "What is his biggest contribution?",
    "What is he known for?",
    "What did he accomplish?",
  ])("treats %s as broad synthesis", (question) => {
    expect(isBroadSynthesisQuestion(question)).toBe(true);
  });

  it("does not narrow a broad contribution question to one routing hint", () => {
    const parameters = [
      { code: "textual_contribution", routingHints: ["contribution", "text"] },
      { code: "role", routingHints: ["role"] },
    ];
    const resolved = resolveQuestionContext("What is the biggest contribution of him?", ["Vishvamitra"]);
    expect(resolved.broadSynthesis).toBe(true);
    expect(isSubjectiveSuperlativeQuestion(resolved.resolvedQuestion)).toBe(true);
    expect(routeParameterCodes(resolved.resolvedQuestion, parameters)).toContain("textual_contribution");
  });
});

describe("grounded Ask presentation", () => {
  it("turns inline citations into inspectable citation tokens", () => {
    expect(inlineAnswerParts("Mandala 3 is associated with the figure [S1].")).toContainEqual({
      type: "citation",
      value: "[S1]",
      citationId: "S1",
    });
  });

  it("groups duplicate citations by source and labels supported source types", () => {
    const second = { ...citation, id: "S2", pageOrSection: "3.53" };
    expect(groupCitations([citation, second])).toHaveLength(1);
    expect(sourceTypeLabel(citation)).toBe("Primary Text");
    expect(sourceTypeLabel({ ...citation, sourceType: "institutional", textualLayer: "Rigveda" })).toBe("Institutional Source");
  });

  it("renders abstention copy as readable paragraphs", () => {
    const message = abstentionMessage("Vishvamitra");
    const blocks = answerBlocks(message);
    expect(blocks).toHaveLength(2);
    expect(message).toContain("do not provide reliable evidence");
  });

  it("keeps quota fallback language user-facing and vendor-neutral", () => {
    expect(SYNTHESIS_FALLBACK_INTRO).toContain("verified evidence");
    expect(SYNTHESIS_FALLBACK_NOTICE).not.toContain("Gemini");
  });
});
