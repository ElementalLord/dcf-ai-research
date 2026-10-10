import { describe, expect, it } from "vitest";
import { classifyQuestionScope } from "@/lib/ask/question-scope";
import { profileEvidenceSalience, selectBroadEvidence } from "@/lib/corpus/rerank";
import { assessEvidenceSufficiency } from "@/lib/live-research/sufficiency";
import { gapSearchQueries } from "@/lib/live-research/gap-query";
import { buildSynthesisPrompt, SYNTHESIS_PROMPT_VERSION } from "@/lib/corpus/synthesis-prompt";
import { renderExtractiveEvidence } from "@/lib/corpus/local-synthesis";
import { answerIntent, prioritizeEvidence } from "@/lib/ask/evidence-priority";
import type { Citation, RetrievedClaim, RetrievedPassage } from "@/lib/corpus/types";

function claim(id: string, parameterCode: string, text: string, sourceTitle = `Source ${id}`): RetrievedClaim {
  return { kind: "claim", id: `claim:${id}`, claimId: id, text, claimKind: "textual", certainty: "high", approvalOrigin: "imported_existing", evidenceType: "primary_text", parameterName: parameterCode, parameterCode,
    fieldLabel: parameterCode, sourceTitle, sourceAuthor: null, sourceInstitution: null, sourceUrl: null, sourceType: "primary_text", pageOrSection: null, evidenceExcerpt: null, chunkId: id, textualLayer: parameterCode };
}

describe("scope-aware grounded answers", () => {
  it("routes the exact benchmark intents without a model call", () => {
    expect(classifyQuestionScope("Who is Vishvamitra?")).toBe("BROAD_PROFILE");
    expect(classifyQuestionScope("What did Vishvamitra do?")).toBe("BROAD_PROFILE");
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

  it("ranks supported deeds above grammatical metadata in a person profile", () => {
    expect(profileEvidenceSalience("The sage teaches a prince and guides him to a sacrifice.", "role"))
      .toBeGreaterThan(profileEvidenceSalience("The plural form of the name appears in seer metadata.", "textual_contribution"));
    const selected = selectBroadEvidence([
      claim("plural", "textual_contribution", "The plural form of the name appears in seer metadata."),
      claim("teacher", "role", "The sage teaches a prince and guides him to a sacrifice."),
    ], 2);
    expect(selected[0].kind === "claim" && selected[0].claimId).toBe("teacher");
    const scholarlyAside: RetrievedPassage = { kind: "passage", id: "passage:aside", chunkId: "aside", sourceId: "study", text: "A king becomes an ascetic in the epic's textual development.", sectionTitle: null,
      pageOrSection: null, textualLayer: "scholarship", sourceTitle: "Academic study of Rishi A", sourceAuthor: null, sourceInstitution: null, sourceUrl: null, sourceType: "scholarship", sourceStatus: "approved", parameterCodes: ["role"] };
    expect(selectBroadEvidence([claim("teacher", "role", "Rishi A teaches a prince."), scholarlyAside], 2, ["Rishi A"]).map((item) => item.id))
      .toContain("passage:aside");
  });

  it("uses tagged institutional science passages for a broad profile", () => {
    const passage: RetrievedPassage = { kind: "passage", id: "passage:science", chunkId: "science", sourceId: "institute",
      text: "Raman founded a research institute and continued his physics experiments there.", sectionTitle: "Institutional history",
      pageOrSection: "Overview", textualLayer: "Institutional history", sourceTitle: "Raman Research Institute", sourceAuthor: null,
      sourceInstitution: "Raman Research Institute", sourceUrl: null, sourceType: "institutional", sourceStatus: "approved",
      parameterCodes: ["institutions"] };
    expect(selectBroadEvidence([passage], 2, ["C. V. Raman"])).toEqual([passage]);
  });

  it("prioritizes experimental method and grounded student lessons", () => {
    const method: RetrievedPassage = { kind: "passage", id: "passage:method", chunkId: "method", sourceId: "lecture",
      text: "A mercury lamp illuminated the liquid, and new lines appeared in its scattered spectrum.", sectionTitle: "Experiment",
      pageOrSection: "p. 272", textualLayer: "Primary scientific account", sourceTitle: "Nobel lecture", sourceAuthor: null,
      sourceInstitution: "Nobel Prize", sourceUrl: null, sourceType: "primary_text", sourceStatus: "approved",
      parameterNames: ["Research methods and innovation"] };
    const award: RetrievedPassage = { ...method, id: "passage:award", chunkId: "award", sourceId: "award", text: "The discovery received an award.", parameterNames: ["Recognition and impact"] };
    expect(answerIntent("How did Raman make his discovery?")).toBe("method");
    expect(answerIntent("What can students learn from Raman?")).toBe("learning");
    expect(prioritizeEvidence("How did Raman make his discovery?", [award, method], 2)[0].id).toBe(method.id);
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
    expect(SYNTHESIS_PROMPT_VERSION).toBe("historical_conversation_v14");
    expect(prompt).toContain("silently review");
    expect(prompt).toContain("using only the supplied IDs");
    expect(prompt).toContain("Evidence grounding constrains WHAT you may claim, not HOW you must phrase it.");
    expect(prompt).toContain("do not write one paragraph or bullet per source");
    expect(prompt).toContain("Open with who the person is");
    expect(prompt).toContain("Use epistemic metadata to control certainty, wording, and citations, without dictating the structure");
    expect(prompt).toContain("Avoid em dashes in your own prose");
    expect(prompt).not.toContain("major supported textual and narrative dimensions");
    expect(prompt).toContain("[C1] Claim");
    expect(prompt).toContain("This is the first answer in the chat");
    expect(prompt).toContain("modern leader's role or leadership challenge");
    expect(prompt).toContain("no headings, bullet lists, numbered sections");
    const followUp = buildSynthesisPrompt({ personality: "Rishi A", question: "Why?", resolvedQuestion: "Why did Rishi A do that?", scope: "EXPLANATION", evidenceContext: "[C1] Claim", openingTurn: false });
    expect(followUp).toContain("This is a follow-up in an ongoing chat");
    expect(followUp).toContain("Do not repeat the opening historical scene");
    expect(followUp).not.toContain("This is the first answer in the chat");
    const research = buildSynthesisPrompt({ personality: "Rishi A", question: "Who is Rishi A?", resolvedQuestion: "Who is Rishi A?", scope: "BROAD_PROFILE", evidenceContext: "[C1] Claim", responseStyle: "research" });
    expect(research).toContain("More depth means more reasoning, not more excerpts");
    const historical = buildSynthesisPrompt({ personality: "Rishi A", question: "What is historically known about Rishi A?", resolvedQuestion: "What is historically known about Rishi A?", scope: "CONTESTED_OR_HISTORICAL", evidenceContext: "[C1] Claim" });
    expect(historical).toContain("Organize by sources, periods, interpretations, or uncertainty");
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
    expect(output).not.toContain("modern reflections");
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

  it("keeps a broad profile person-centered during a provider outage", () => {
    const items = [
      claim("identity", "role", "Rishi A is a sage and guide to a prince."),
      claim("action", "social_role", "Rishi A teaches the prince and protects a sacrifice."),
      claim("development", "tapas_sadhana", "Rishi A becomes an ascetic after ruling as king."),
    ];
    const citations = items.map((item, index): Citation => ({ id: `C${index + 1}`, kind: "approved_claim", claimId: item.claimId, title: item.sourceTitle || "Claim", author: null,
      institution: null, url: null, sourceType: item.sourceType, pageOrSection: null, textualLayer: item.textualLayer, excerpt: item.text }));
    const output = renderExtractiveEvidence(items, citations, true, "BROAD_PROFILE", "Who is Rishi A?");
    expect(output).toContain("teaches the prince");
    expect(output).toContain("becomes an ascetic");
    expect(output).not.toMatch(/Early textual picture:|Later narrative:/);
  });
});
