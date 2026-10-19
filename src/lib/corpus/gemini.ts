import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { CorpusError, type CorpusErrorCode } from "./errors";
import { boundedProviderCall, generationCircuit, providerErrorDetails, type ProviderCircuit } from "./provider-health";
import { authorizeResearchModelCall, finishResearchModelCall, recordAiCall, recordModelTokens, recordUnmeteredModelCall } from "./usage";

export const GENERATION_MODEL = process.env.SYNTHESIS_MODEL || process.env.GEMINI_GENERATION_MODEL || "gemini-3.7-flash";
export const ALTERNATE_SYNTHESIS_MODEL = process.env.SYNTHESIS_ALTERNATE_MODEL || "gemini-3.5-flash-lite";
export const SYNTHESIS_MAX_OUTPUT_TOKENS = 2048;

export type GenerationDiagnostics = { evidenceRecords: number; evidenceCharacters: number; promptCharacters: number; estimatedPromptTokens: number };
export type GenerationOptions = { timeoutMs?: number; errorCode?: CorpusErrorCode; model?: string; circuit?: ProviderCircuit; callLimit?: number; synthesisDiagnostics?: GenerationDiagnostics };

export async function generateText(prompt: string, options: GenerationOptions = {}): Promise<{ text: string; interactionId: string | null; model: string }> {
  const code = options.errorCode || "GEMINI_FAILED";
  const model = options.model || GENERATION_MODEL;
  const circuit = options.circuit || generationCircuit;
  if (!process.env.GEMINI_API_KEY) throw new CorpusError(code, "Provider not configured.", 503);
  if (circuit.state().open) throw new CorpusError(code, "Provider cooldown active.", 503);
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const configuredTimeout = Number(process.env.SYNTHESIS_TIMEOUT_MS || 40000);
  const timeout = Math.max(250, Math.min(options.timeoutMs || configuredTimeout || 40000, 45000));
  const started = performance.now();
  const diagnostic = options.synthesisDiagnostics;
  const common = diagnostic ? { model, evidenceRecords: diagnostic.evidenceRecords, evidenceCharacters: diagnostic.evidenceCharacters,
    promptCharacters: diagnostic.promptCharacters, estimatedPromptTokens: diagnostic.estimatedPromptTokens,
    maxOutputTokens: SYNTHESIS_MAX_OUTPUT_TOKENS, timeoutMs: timeout } : null;
  let attempted = false;
  let metered = false;
  const heldMicro = authorizeResearchModelCall(prompt.length, SYNTHESIS_MAX_OUTPUT_TOKENS);
  try {
    recordAiCall("generativeCalls", options.callLimit || 1);
    attempted = true;
    const response = await boundedProviderCall((abortSignal) => ai.models.generateContent({
      model, contents: prompt, config: { abortSignal, maxOutputTokens: SYNTHESIS_MAX_OUTPUT_TOKENS,
        ...(diagnostic && /^gemini-3\./.test(model) ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
        httpOptions: { retryOptions: { attempts: 1 } } },
    }), timeout);
    recordModelTokens(response.usageMetadata?.promptTokenCount, response.usageMetadata?.candidatesTokenCount);
    finishResearchModelCall(heldMicro, response.usageMetadata?.promptTokenCount, response.usageMetadata?.candidatesTokenCount, true);
    metered = true;
    const text = response?.text?.trim();
    if (!text) throw new Error("Provider returned no text.");
    circuit.succeed();
    if (common) console.info("synthesis_provider_attempt", JSON.stringify({ ...common, success: true, durationMs: Math.round(performance.now() - started),
      actualPromptTokens: response.usageMetadata?.promptTokenCount || null, responseTokens: response.usageMetadata?.candidatesTokenCount || null,
      thoughtTokens: response.usageMetadata?.thoughtsTokenCount || null, finishReason: response.candidates?.[0]?.finishReason || null }));
    return { text, interactionId: null, model };
  } catch (error) {
    if (attempted && !metered) recordUnmeteredModelCall();
    if (!metered) finishResearchModelCall(heldMicro, null, null, attempted);
    const details = providerErrorDetails(error);
    if (common) console.warn("synthesis_provider_attempt", JSON.stringify({ ...common, success: false,
      durationMs: Math.round(performance.now() - started), ...details }));
    else console.warn("Gemini generation failed:", error instanceof Error ? error.message : String(error));
    circuit.fail(details.category, diagnostic && details.category === "TIMEOUT" ? 2 * 60_000 : undefined);
    throw new CorpusError(code, "AI generation temporarily unavailable.", 503, { cause: error });
  }
}

export function parseGeminiJson<T>(text: string): T {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const start = Math.min(
    ...[cleaned.indexOf("["), cleaned.indexOf("{")].filter((index) => index >= 0),
  );
  if (!Number.isFinite(start)) throw new Error("Gemini did not return JSON.");
  const opening = cleaned[start];
  const end = opening === "[" ? cleaned.lastIndexOf("]") : cleaned.lastIndexOf("}");
  if (end < start) throw new Error("Gemini returned incomplete JSON.");
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}
