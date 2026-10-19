import { generateText, GENERATION_MODEL, ALTERNATE_SYNTHESIS_MODEL, type GenerationDiagnostics } from "./gemini";
import { aiSynthesisEnabled, renderExtractiveEvidence } from "./local-synthesis";
import { alternateGenerationCircuit, classifyProviderError, generationCircuit } from "./provider-health";
import type { Citation, RetrievedEvidence } from "./types";
import type { QuestionScope } from "@/lib/ask/question-scope";

export type SynthesisInput = { prompt: string; evidence: RetrievedEvidence[]; citations: Citation[]; broad: boolean; scope?: QuestionScope; question?: string; responseStyle?: "simple" | "balanced" | "detailed" | "research"; diagnostics?: GenerationDiagnostics };
export interface SynthesisProvider {
  name: string;
  model: string | null;
  isConfigured(): boolean;
  generateGroundedAnswer(input: SynthesisInput): Promise<{ text: string; interactionId: string | null; model?: string }>;
  classifyError: typeof classifyProviderError;
}
export class GeminiSynthesisProvider implements SynthesisProvider {
  name = "gemini";
  model = GENERATION_MODEL;
  classifyError = classifyProviderError;
  isConfigured() { return Boolean(process.env.GEMINI_API_KEY) && aiSynthesisEnabled() && process.env.SYNTHESIS_DISABLED !== "true"; }
  private alternateAvailable() { return Boolean(ALTERNATE_SYNTHESIS_MODEL && ALTERNATE_SYNTHESIS_MODEL !== this.model && process.env.SYNTHESIS_ALTERNATE_DISABLED !== "true"); }
  private transient(category: string | null) { return category === "TRANSIENT" || category === "TIMEOUT"; }
  async generateGroundedAnswer(input: SynthesisInput) {
    const primaryState = generationCircuit.state();
    const alternate = (callLimit: number) => generateText(input.prompt, { model: ALTERNATE_SYNTHESIS_MODEL,
      circuit: alternateGenerationCircuit, callLimit: process.env.DEMAND_RESEARCH_ENABLED === "true" ? 7 : callLimit, timeoutMs: process.env.SYNTHESIS_TIMEOUT_MS ? undefined : 20_000, synthesisDiagnostics: input.diagnostics });
    if (primaryState.open) {
      if (this.transient(primaryState.category) && this.alternateAvailable() && !alternateGenerationCircuit.state().open) return alternate(1);
      throw new Error(`Synthesis provider cooldown: ${primaryState.category || "unknown"}`);
    }
    try {
      return await generateText(input.prompt, { model: this.model, callLimit: process.env.DEMAND_RESEARCH_ENABLED === "true" ? 7 : 1,
        timeoutMs: process.env.SYNTHESIS_TIMEOUT_MS ? undefined : 12_000, synthesisDiagnostics: input.diagnostics });
    } catch (error) {
      if (!this.transient(classifyProviderError(error)) || !this.alternateAvailable() || alternateGenerationCircuit.state().open) throw error;
      console.info("synthesis_alternate_selected", JSON.stringify({ primaryModel: this.model, alternateModel: ALTERNATE_SYNTHESIS_MODEL,
        primaryFailure: classifyProviderError(error) }));
      return alternate(2);
    }
  }
  health() { const circuit = generationCircuit.state(); const alternateReady = this.alternateAvailable() && !alternateGenerationCircuit.state().open;
    return { configured: this.isConfigured(), healthy: this.isConfigured() && (!circuit.open || (this.transient(circuit.category) && alternateReady)), circuit }; }
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
