import { describe, expect, it } from "vitest";
import { resolveQuestionContext } from "@/lib/ask/query-context";
import { gapSearchQueries } from "@/lib/live-research/gap-query";
import { abstentionMessage } from "@/lib/ask/messages";
import { answerBlocks, groupCitations, inlineAnswerParts, isIncompleteQuestion, isUnusableStoredAnswer, sourceTypeLabel, type AskCitation } from "@/lib/ask/presentation";
import { isBroadSynthesisQuestion, isSubjectiveSuperlativeQuestion, routeParameterCodes } from "@/lib/corpus/routing";
import { aiSynthesisEnabled, synthesizeFromLocalEvidence } from "@/lib/corpus/local-synthesis";
import type { RetrievedClaim, RetrievedPassage } from "@/lib/corpus/types";

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
  it("drops a conversational retrieval lead-in and resolves the selected person", () => {
    const resolved = resolveQuestionContext("Find me it, what did he do that is important", ["Adi Shankaracharya"],
      [{ question: "Which works are attributed to him?", answer: "The commentary discusses an Advaita Vedanta theory." }]);
    expect(resolved.resolvedQuestion).toBe("what did Adi Shankaracharya do that is important");
    expect(resolved.scope).toBe("BROAD_SIGNIFICANCE");
    expect(resolved.broadSynthesis).toBe(true);
  });
  it.each([
    ["Show me this: what did she do that mattered?", "Savitribai Phule"],
    ["Please find me this, what did he do that was significant?", "C. V. Raman"],
    ["Tell me what he did that mattered", "Verghese Kurien"],
  ])("keeps a free-form importance question broad: %s", (question, person) => {
    const resolved = resolveQuestionContext(question, [person]);
    expect(resolved.resolvedQuestion).toContain(person);
    expect(resolved.scope).toBe("BROAD_SIGNIFICANCE");
  });
  it.each([
    ["Explain this in mroe depth", "J. R. D. Tata", "What is J. R. D. Tata known for?"],
    ["Could you elaborate on that?", "C. V. Raman", "Why was C. V. Raman's discovery important?"],
    ["More details, please", "Vishvamitra", "Who was Vishvamitra?"],
    ["Can you go deeper into it?", "Savitribai Phule", "What did Savitribai Phule accomplish?"],
    ["Please expand on your answer", "Rabindranath Tagore", "What is Rabindranath Tagore known for?"],
    ["Explain this in detial", "Rani Lakshmibai", "Who was Rani Lakshmibai?"],
  ])("expands the previous topic for %s", (followup, person, priorQuestion) => {
    const resolved = resolveQuestionContext(followup, [person], [{ question: priorQuestion, resolvedQuestion: priorQuestion }]);
    expect(resolved.depthFollowup).toBe(true);
    expect(resolved.resolvedQuestion).toBe(priorQuestion);
  });

  it("keeps an explicitly named new topic and standalone requests distinct from generic follow-ups", () => {
    const history = [{ question: "What is J. R. D. Tata known for?" }];
    expect(resolveQuestionContext("Explain Air India in more depth", ["J. R. D. Tata"], history).depthFollowup).toBe(false);
    expect(resolveQuestionContext("Tell me more about civil aviation", ["J. R. D. Tata"], history).depthFollowup).toBe(false);
    expect(resolveQuestionContext("Explain this in more depth", ["J. R. D. Tata"]).depthFollowup).toBe(false);
  });

  it("treats an empty saved reply as retryable", () => {
    expect(isUnusableStoredAnswer("   ", "complete")).toBe(true);
  });
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

  it("carries a cited discovery into a Raman follow-up", () => {
    const history = [{ question: "Who was C. V. Raman?", answer: "In 1928, Raman demonstrated the Raman Effect, changing how scientists studied molecules.", citedConcepts: ["Raman Effect"] }];
    expect(resolveQuestionContext("Why was that discovery important?", ["C. V. Raman"], history).resolvedQuestion).toContain("Raman Effect");
    const comparison = resolveQuestionContext("Was anyone doing something similar at the time?", ["C. V. Raman"], history);
    expect(comparison.resolvedQuestion).toContain("work similar to Raman Effect");
    expect(comparison.resolvedQuestion).toContain("C. V. Raman");
    expect(comparison.subjects).toEqual(["C. V. Raman"]);
    expect(comparison.resolvedQuestion).not.toContain("Selected personality:");
    expect(gapSearchQueries("C. V. Raman", comparison.resolvedQuestion, ["contemporary comparable work"])[0]).toContain("comparable");
  });

  it("uses the previous question when a weak prior answer is omitted", () => {
    const resolved = resolveQuestionContext("Why was that important?", ["C. V. Raman"], [
      { question: "What was the Raman Effect?", resolvedQuestion: "What was the Raman Effect?" },
    ]);
    expect(resolved.resolvedQuestion).toContain("What was the Raman Effect?");
    expect(resolved.resolvedQuestion).toContain("C. V. Raman");
  });

  it("keeps the Vishvamitra and Vasistha conflict in a follow-up", () => {
    const history = [{ question: "What happened with Vasistha?", answer: "The traditional accounts describe a conflict between Vishvamitra and Vasistha.", citedConcepts: ["Vishvamitra and Vasistha conflict"] }];
    expect(resolveQuestionContext("Why was that conflict important?", ["Vishvamitra"], history).resolvedQuestion).toContain("Vishvamitra and Vasistha conflict");
  });

  it("uses a cited topic as a search lead when a plural follow-up omits both names", () => {
    const history = [{ question: "What happened between Vishvamitra and Vasistha?", answer: "The Ramayana describes Vishvamitra visiting Vasistha.", citedConcepts: ["Valmiki Ramayana - Vishvamitra, Vasistha and Shabala - Bala Kanda"] }];
    const resolved = resolveQuestionContext("Why did they become enemies?", ["Vasistha"], history);
    expect(resolved.resolvedQuestion).toContain("Vasistha and Vishvamitra");
    expect(resolved.resolvedQuestion).toContain("Shabala");
    expect(gapSearchQueries("Vasistha", resolved.resolvedQuestion, ["enemies"])[0]).toContain("Shabala");
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
  it("catches a question that stops before its subject is clear", () => {
    expect(isIncompleteQuestion("why is he")).toBe(true);
    expect(isIncompleteQuestion("Why is he important?")).toBe(false);
  });

  it("replaces an old stored page scrape without hiding a valid fallback", () => {
    expect(isUnusableStoredAnswer("Dr. Kalam describes skip to main content Dr. Kalam Education", "extractive_fallback")).toBe(true);
    expect(isUnusableStoredAnswer("A concise answer from the retrieved passage.", "extractive_fallback")).toBe(false);
  });

  it("keeps a live citation separate from a library citation at the same URL", () => {
    const live: AskCitation = { ...citation, id: "S2", kind: "live_web_source" };
    const groups = groupCitations([citation, live]);
    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.citations[0].kind)).toEqual(["approved_source_passage", "live_web_source"]);
  });
  it("turns inline citations into inspectable citation tokens", () => {
    expect(inlineAnswerParts("Mandala 3 is associated with the figure [S1].")).toContainEqual({
      type: "citation",
      value: "[S1]",
      citationId: "S1",
    });
  });

  it("renders grouped model citations as individually inspectable source tokens", () => {
    expect(inlineAnswerParts("Grounded claim [C1, C4; S2].").filter((part) => part.type === "citation")).toEqual([
      { type: "citation", value: "[C1]", citationId: "C1" },
      { type: "citation", value: "[C4]", citationId: "C4" },
      { type: "citation", value: "[S2]", citationId: "S2" },
    ]);
  });

  it("keeps adjacent citations compact and after sentence punctuation", () => {
    expect(inlineAnswerParts("She taught in Naigaon [C5] [S7]. Next point.")).toEqual([
      { type: "text", value: "She taught in Naigaon." },
      { type: "citation", value: "[C5]", citationId: "C5" },
      { type: "citation", value: "[S7]", citationId: "S7" },
      { type: "text", value: " Next point." },
    ]);
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
    expect(message).toContain("couldn't verify a reliable answer");
    expect(message.split(/(?<=[.!?])\s+/)).toHaveLength(3);
  });

  it("uses readable local corpus synthesis by default without a Gemini request", () => {
    const claim: RetrievedClaim = {
      kind: "claim", id: "claim:1", claimId: "1", text: "In the Rigvedic layer, Vishvamitra and his family are associated with Mandala 3 as mantra-seers; in the Ramayana, Vishvamitra also functions as an ascetic teacher and guide to Rama.",
      claimKind: "textual_tradition", certainty: "high", approvalOrigin: "human_manual", evidenceType: "direct",
      parameterName: "Role", fieldLabel: "Identity", sourceTitle: "Approved profile", sourceAuthor: null,
      sourceInstitution: null, sourceUrl: null, sourceType: "scholarly_article", pageOrSection: "Overview",
      evidenceExcerpt: null, chunkId: null, textualLayer: "Cross-textual profile",
    };
    const passage: RetrievedPassage = {
      kind: "passage", id: "passage:1", chunkId: "1", sourceId: "1", text: "A long primary-text passage.",
      sectionTitle: null, pageOrSection: "1.1", textualLayer: "Ramayana", sourceTitle: "Primary text",
      sourceAuthor: null, sourceInstitution: null, sourceUrl: null, sourceType: "primary_text", sourceStatus: "approved",
    };
    const output = synthesizeFromLocalEvidence("Vishvamitra", [passage, claim], [
      { ...citation, id: "S1", chunkId: "1" },
      { ...citation, id: "C1", kind: "approved_claim", claimId: "1" },
    ], { broadSynthesis: true, subjectiveSuperlative: false });
    expect(aiSynthesisEnabled(undefined)).toBe(false);
    expect(aiSynthesisEnabled("gemini")).toBe(true);
    expect(output).toContain("### In brief");
    expect(output).toContain("Vishvamitra is an ascetic teacher and guide to Rama");
    expect(output).toContain("an ascetic teacher");
    expect(output).not.toContain("also functions as");
    expect(output.indexOf("Vishvamitra is an ascetic teacher")).toBeLessThan(output.indexOf("A long primary-text passage"));
    expect(output).not.toContain("temporarily unavailable");
  });
});
