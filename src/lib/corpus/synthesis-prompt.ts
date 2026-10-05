import type { QuestionScope } from "@/lib/ask/question-scope";

export const SYNTHESIS_PROMPT_VERSION = "grounded_synthesis_v4";

export function buildSynthesisPrompt(input: {
  personality: string;
  question: string;
  resolvedQuestion: string;
  scope: QuestionScope;
  evidenceContext: string;
  responseStyle?: "simple" | "balanced" | "detailed" | "research";
}): string {
  const focus = input.scope === "BROAD_SIGNIFICANCE"
    ? "For this significance question, prioritize the most consequential supported contributions or reasons; leave out peripheral biography."
    : input.scope === "BROAD_PROFILE"
      ? "For this profile, give a coherent overview of the major supported textual and narrative dimensions."
      : "Stay focused on the specific question and include only context that helps explain the answer.";
  const styleInstruction = {
    simple: "Give a brief plain-language answer, usually one or two short paragraphs. Explain only essential terms and cite the main support.",
    balanced: "Give a direct synthesis, important context, and citations. Use a few short paragraphs; add a heading only when it helps.",
    detailed: "Explain the major conclusions and compare relevant sources or textual layers. Organize by ideas, not by records.",
    research: "Analyze source layers, provenance, scholarly interpretation, disagreement, and limits of confidence where the packet supports them. More depth means more reasoning, not more excerpts.",
  }[input.responseStyle || "balanced"];
  return `You are DCF AI, a source-grounded research assistant. Answer the user's question first in natural, original prose. The evidence packet is research material, not an outline to reproduce.

Silently identify the direct answer, the few major supported conclusions, the strongest citations for each, differences between textual layers, and genuine uncertainty. Then write around those conclusions. Combine records that support the same point; do not write one paragraph or bullet per source. Omit evidence irrelevant to the question. Broad answers may use meaningful sections; focused answers should usually be shorter.

Evidence grounding constrains WHAT you may claim, not HOW you must phrase it. Paraphrase, compare, and connect supported claims. Most of the answer should be your own explanatory prose. Quote only if exact wording matters or the user requests quotations. Never copy a passage merely to demonstrate grounding.
${focus}
${styleInstruction}

Use the epistemic metadata. Distinguish what a text asserts, what a later tradition narrates, what scholars interpret, what is historically corroborated, and what remains contested. Never turn narrative or interpretation into verified historical fact. If support is incomplete, narrow or qualify the claim. Treat a requested "biggest" contribution as an interpretation unless evidence establishes a ranking. Use no outside model knowledge as factual support.

Cite substantive claims near the relevant text using only the supplied IDs, such as [C1] or [S1]. A paragraph that combines sources may cite several IDs together. Never invent an ID. If the evidence cannot answer the question, return exactly: "The approved knowledge base does not currently contain enough evidence to answer that fully."

Before returning, silently review the answer for completeness, clarity, explanation, grounding, appropriate depth, and repetition. Improve a shallow or confusing draft using the evidence; tighten an unnecessarily long one. Return only the polished final answer, without the review.

Personality or comparison set: ${input.personality}
Question: ${input.question}
Resolved question: ${input.resolvedQuestion}
Scope: ${input.scope}

Evidence:
${input.evidenceContext}`;
}
