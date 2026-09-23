import { buildBoundedContext } from "./context";
import { generateText } from "./gemini";
import { logStage, stageTimer } from "./observability";
import { retrieveWithApprovedResearch } from "@/lib/live-research/research";
import { citationsMatchEvidence, mergePersonalityEvidence } from "./comparison";
import { loadPersonalityConfiguration } from "./personality-context";
import { normalizedAliases } from "./personality-config";
import { resolveQuestionContext, type ConversationQuestion } from "@/lib/ask/query-context";
import { abstentionMessage } from "@/lib/ask/messages";
import { aiSynthesisEnabled, synthesizeFromLocalEvidence } from "./local-synthesis";

const ABSTENTION = "The approved knowledge base does not currently contain enough evidence to answer that fully.";

function removeUnknownCitations(answer: string, validIds: Set<string>): string {
  return answer.replace(/\[([CS]\d+)\]/g, (full, id: string) => (validIds.has(id) ? full : ""));
}

export async function answerQuestion(
  question: string,
  personalityId: string | string[],
  options: { history?: ConversationQuestion[] } = {},
) {
  const personalityIds = [...new Set(Array.isArray(personalityId) ? personalityId : [personalityId])];
  const configurations = await Promise.all(personalityIds.map(loadPersonalityConfiguration));
  const queryContext = resolveQuestionContext(
    question,
    configurations.map((configuration) => configuration.canonicalName),
    options.history,
  );
  const comparisonAliases = personalityIds.length > 1
    ? configurations.flatMap((configuration) => normalizedAliases(configuration.canonicalName, configuration.aliases))
    : [];
  const retrievals = await Promise.all(personalityIds.map((id) => retrieveWithApprovedResearch(queryContext.resolvedQuestion, id, { additionalPersonalityAliases: comparisonAliases })));
  const comparisonMode = retrievals.length > 1;
  const personality = retrievals.map((retrieval) => retrieval.personality).join(" and ");
  const parameters = [...new Map(retrievals.flatMap((retrieval) => retrieval.parameters).map((parameter) => [parameter.code, parameter])).values()];
  const debug = {
    ...retrievals[0].debug,
    comparisonMode,
    selectedPersonalities: retrievals.map((retrieval) => ({ id: retrieval.personalityId, name: retrieval.personality })),
    perPersonality: retrievals.map((retrieval) => ({ personality: retrieval.personality, debug: retrieval.debug })),
  };
  if (retrievals.some((retrieval) => !retrieval.debug.localEvidenceSufficient)) {
    return {
      personality,
      question,
      resolvedQuestion: queryContext.resolvedQuestion,
      queryContext,
      status: "abstained" as const,
      answer: abstentionMessage(personality),
      retrievedParameters: parameters,
      citations: [],
      evidence: [],
      conflicts: [],
      debug,
    };
  }
  const evidence = comparisonMode
    ? mergePersonalityEvidence(retrievals.map((retrieval) => ({ personalityId: retrieval.personalityId, personalityName: retrieval.personality, evidence: retrieval.evidence })))
    : retrievals[0].evidence;
  const bounded = buildBoundedContext(evidence);
  debug.finalSelectedEvidenceCount = bounded.selected.length;
  if (!bounded.context) {
    return {
      personality,
      question,
      resolvedQuestion: queryContext.resolvedQuestion,
      queryContext,
      status: "abstained" as const,
      answer: abstentionMessage(personality),
      retrievedParameters: parameters,
      citations: [],
      evidence: [],
      conflicts: [],
      debug,
    };
  }
  if (!citationsMatchEvidence(bounded.citations, bounded.selected)) {
    throw new Error("Citation integrity validation failed before answer generation.");
  }

  const stopGeneration = stageTimer("GENERATION");
  let generated: { text: string; interactionId: string | null };
  let usedLocalSynthesis = false;
  if (!aiSynthesisEnabled()) {
    usedLocalSynthesis = true;
    debug.generationFallbackReason = "AI synthesis disabled; using approved local evidence synthesis.";
    generated = {
      text: synthesizeFromLocalEvidence(personality, bounded.selected, bounded.citations, queryContext),
      interactionId: null,
    };
  } else {
    const prompt = `You are the DCF Inspiring Personalities AI.
Answer using ONLY the retrieved evidence below. Do not use pretrained knowledge as evidence.

PERSONALITY OR INTENTIONAL COMPARISON SET: ${personality}
QUESTION: ${question}
RESOLVED QUESTION FOR REFERENCE: ${queryContext.resolvedQuestion}

EVIDENCE:
${bounded.context}

Rules:
1. Every important factual statement needs one or more exact evidence citations such as [C1] or [S1].
2. Never invent a citation or a fact.
3. APPROVED CLAIM and DIRECT PASSAGE FROM AN APPROVED SOURCE are different trust classes; preserve approval origin and evidence type.
4. Label primary text, epic/traditional narrative, scholarly interpretation, modern spiritual interpretation, and uncertain or contested material accurately.
5. Never present an epic or other traditional narrative passage as independently verified modern history.
6. Do not silently resolve conflicts between traditions or textual layers.
7. If the evidence only permits an inference, say that the passage suggests or portrays it.
8. If the evidence does not answer the question, respond exactly: "${ABSTENTION}"
9. Prefer a direct, concise answer before explanation.
10. For subjective or superlative wording, do not present a ranking as objectively proven. State the criterion and use language such as "one of the most significant" unless the evidence explicitly establishes a ranking.
11. For broad synthesis questions, weigh relevant evidence across roles, texts, ideas, historical or textual significance, and narrative traditions when those dimensions are present.
12. Use short paragraphs and occasional descriptive headings or bullets when they improve readability.`;
    try {
      generated = await generateText(prompt, { timeoutMs: 45_000, errorCode: "GEMINI_FAILED" });
      debug.generationFallbackReason = null;
    } catch (error) {
      usedLocalSynthesis = true;
      debug.generationFallbackReason = error instanceof Error ? error.message : "Gemini generation unavailable.";
      generated = {
        text: synthesizeFromLocalEvidence(personality, bounded.selected, bounded.citations, queryContext),
        interactionId: null,
      };
    }
  }
  debug.latenciesMs.generation = stopGeneration();
  logStage("FINAL_CONTEXT", { records: bounded.selected.length, characters: bounded.context.length });
  logStage("GENERATION", { ms: debug.latenciesMs.generation });
  const validIds = new Set(bounded.citations.map((citation) => citation.id));
  const cleanedAnswer = removeUnknownCitations(generated.text, validIds).trim();
  const abstained = cleanedAnswer === ABSTENTION;
  const answer = abstained ? abstentionMessage(personality) : cleanedAnswer;
  const layers = [...new Set(bounded.selected.map((item) => item.textualLayer).filter(Boolean))];
  const conflicts = layers.length > 1
    ? [{ type: "TEXTUAL_LAYER_VARIANT", message: "Evidence from multiple textual layers was retrieved; the answer should preserve their distinctions.", layers }]
    : [];

  return {
    personality,
    question,
    resolvedQuestion: queryContext.resolvedQuestion,
    queryContext,
    status: abstained ? "abstained" as const : usedLocalSynthesis ? "local_synthesis" as const : "complete" as const,
    answer,
    retrievedParameters: parameters,
    citations: bounded.citations,
    evidence: bounded.selected.map((item, index) => ({ citationId: bounded.citations[index]?.id, ...item })),
    conflicts,
    debug,
    interactionId: generated.interactionId,
  };
}
