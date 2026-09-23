import { buildBoundedContext } from "./context";
import { generateText } from "./gemini";
import { logStage, stageTimer } from "./observability";
import { retrieveWithApprovedResearch } from "@/lib/live-research/research";
import { truncateText } from "./text";

const ABSTENTION = "The approved knowledge base does not currently contain enough evidence to answer that fully.";

function removeUnknownCitations(answer: string, validIds: Set<string>): string {
  return answer.replace(/\[([CS]\d+)\]/g, (full, id: string) => (validIds.has(id) ? full : ""));
}

function extractiveFallback(
  personality: string,
  selected: ReturnType<typeof buildBoundedContext>["selected"],
  citationIds: string[],
): string {
  const lines = selected.slice(0, 8).map((item, index) => {
    const framing = item.kind === "claim"
      ? item.claimKind === "traditional_account" || item.claimKind === "textual_tradition"
        ? "The reviewed tradition records"
        : "The approved research states"
      : item.textualLayer
        ? `In the ${item.textualLayer} source layer, the passage states`
        : "The approved source passage states";
    return `- ${framing}: ${truncateText(item.text, 650)} [${citationIds[index]}]`;
  });
  return `Gemini synthesis is temporarily unavailable, so here is the directly retrieved evidence about ${personality}:\n\n${lines.join("\n\n")}`;
}

export async function answerQuestion(question: string, personalityId: string) {
  const retrieval = await retrieveWithApprovedResearch(question, personalityId);
  if (!retrieval.debug.localEvidenceSufficient) {
    return {
      personality: retrieval.personality,
      question,
      answer: ABSTENTION,
      retrievedParameters: retrieval.parameters,
      citations: [],
      evidence: [],
      conflicts: [],
      debug: retrieval.debug,
    };
  }
  const bounded = buildBoundedContext(retrieval.evidence);
  retrieval.debug.finalSelectedEvidenceCount = bounded.selected.length;
  if (!bounded.context) {
    return {
      personality: retrieval.personality,
      question,
      answer: ABSTENTION,
      retrievedParameters: retrieval.parameters,
      citations: [],
      evidence: [],
      conflicts: [],
      debug: retrieval.debug,
    };
  }

  const prompt = `You are the DCF Inspiring Personalities AI.
Answer using ONLY the retrieved evidence below. Do not use pretrained knowledge as evidence.

PERSONALITY: ${retrieval.personality}
QUESTION: ${question}

EVIDENCE:
${bounded.context}

Rules:
1. Every important factual statement needs one or more exact evidence citations such as [C1] or [S1].
2. Never invent a citation or a fact.
3. HUMAN-APPROVED CLAIM and DIRECT PASSAGE FROM AN APPROVED SOURCE are different trust classes; preserve that distinction.
4. Label primary text, epic/traditional narrative, scholarly interpretation, modern spiritual interpretation, and uncertain or contested material accurately.
5. Never present a Ramayana or other narrative passage as independently verified modern history.
6. Do not silently resolve conflicts between traditions or textual layers.
7. If the evidence only permits an inference, say that the passage suggests or portrays it.
8. If the evidence does not answer the question, respond exactly: "${ABSTENTION}"
9. Prefer a direct, concise answer before explanation.`;
  const stopGeneration = stageTimer("GENERATION");
  let generated: { text: string; interactionId: string | null };
  try {
    generated = await generateText(prompt, { timeoutMs: 45_000, errorCode: "GEMINI_FAILED" });
    retrieval.debug.generationFallbackReason = null;
  } catch (error) {
    retrieval.debug.generationFallbackReason = error instanceof Error ? error.message : "Gemini generation unavailable.";
    generated = {
      text: extractiveFallback(retrieval.personality, bounded.selected, bounded.citations.map((citation) => citation.id)),
      interactionId: null,
    };
  }
  retrieval.debug.latenciesMs.generation = stopGeneration();
  logStage("FINAL_CONTEXT", { records: bounded.selected.length, characters: bounded.context.length });
  logStage("GENERATION", { ms: retrieval.debug.latenciesMs.generation });
  const validIds = new Set(bounded.citations.map((citation) => citation.id));
  const answer = removeUnknownCitations(generated.text, validIds);
  const layers = [...new Set(bounded.selected.map((item) => item.textualLayer).filter(Boolean))];
  const conflicts = layers.length > 1
    ? [{ type: "TEXTUAL_LAYER_VARIANT", message: "Evidence from multiple textual layers was retrieved; the answer should preserve their distinctions.", layers }]
    : [];

  return {
    personality: retrieval.personality,
    question,
    answer,
    retrievedParameters: retrieval.parameters,
    citations: bounded.citations,
    evidence: bounded.selected.map((item, index) => ({ citationId: bounded.citations[index]?.id, ...item })),
    conflicts,
    debug: retrieval.debug,
    interactionId: generated.interactionId,
  };
}
