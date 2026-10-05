import { generateText, GENERATION_MODEL } from "./gemini";
import { aiSynthesisEnabled, renderExtractiveEvidence } from "./local-synthesis";
import { classifyProviderError, generationCircuit } from "./provider-health";
import type { Citation, RetrievedEvidence } from "./types";
import type { QuestionScope } from "@/lib/ask/question-scope";

export type SynthesisInput = { prompt: string; evidence: RetrievedEvidence[]; citations: Citation[]; broad: boolean; scope?: QuestionScope; question?: string; responseStyle?: "simple" | "balanced" | "detailed" | "research" };
export interface SynthesisProvider {
  name: string;
  model: string | null;
  isConfigured(): boolean;
  generateGroundedAnswer(input: SynthesisInput): Promise<{ text: string; interactionId: string | null }>;
  classifyError: typeof classifyProviderError;
}
export class GeminiSynthesisProvider implements SynthesisProvider {
  name = "gemini";
  model = GENERATION_MODEL;
  classifyError = classifyProviderError;
  isConfigured() { return Boolean(process.env.GEMINI_API_KEY) && aiSynthesisEnabled() && process.env.SYNTHESIS_DISABLED !== "true"; }
  async generateGroundedAnswer(input: SynthesisInput) { return generateText(input.prompt); }
  health() { const circuit = generationCircuit.state(); return { configured: this.isConfigured(), healthy: this.isConfigured() && !circuit.open, circuit }; }
}
export class ExtractiveSynthesisProvider implements SynthesisProvider {
  name = "extractive";
  model = null;
  classifyError = classifyProviderError;
  isConfigured() { return true; }
  async generateGroundedAnswer(input: SynthesisInput) {
    return { text: renderExtractiveEvidence(input.evidence, input.citations, input.broad, input.scope, input.question, input.responseStyle), interactionId: null };
  }
}
export function validateAnswerCitations(text: string, citations: Citation[]): boolean {
  const references = [...text.matchAll(/\[([^\]\n]+)\]/g)].flatMap((bracket) =>
    [...bracket[1].matchAll(/\b([A-Za-z]+)\s*(\d+)\b/g)].map((match) => `${match[1]}${match[2]}`),
  );
  const valid = new Set(citations.map((citation) => citation.id));
  return references.length > 0 && references.every((id) => valid.has(id));
}
