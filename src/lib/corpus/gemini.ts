import { GoogleGenAI } from "@google/genai";
import { CorpusError, type CorpusErrorCode } from "./errors";
import { boundedProviderCall, classifyProviderError, generationCircuit } from "./provider-health";
import { recordAiCall } from "./usage";

export const GENERATION_MODEL = process.env.SYNTHESIS_MODEL || process.env.GEMINI_GENERATION_MODEL || "gemini-3.8-flash";
export const SYNTHESIS_MAX_OUTPUT_TOKENS = 2048;

export async function generateText(prompt: string, options: { timeoutMs?: number; errorCode?: CorpusErrorCode } = {}): Promise<{ text: string; interactionId: string | null }> {
  const code = options.errorCode || "GEMINI_FAILED";
  if (!process.env.GEMINI_API_KEY) throw new CorpusError(code, "Provider not configured.", 503);
  if (generationCircuit.state().open) throw new CorpusError(code, "Provider cooldown active.", 503);
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const configuredTimeout = Number(process.env.SYNTHESIS_TIMEOUT_MS || 25000);
  const timeout = Math.max(250, Math.min(options.timeoutMs || configuredTimeout || 25000, 30000));
  try {
    recordAiCall("generativeCalls");
    const response = await boundedProviderCall((abortSignal) => ai.models.generateContent({
      model: GENERATION_MODEL, contents: prompt, config: { abortSignal, maxOutputTokens: SYNTHESIS_MAX_OUTPUT_TOKENS, httpOptions: { retryOptions: { attempts: 1 } } },
    }), timeout);
    const text = response?.text?.trim();
    if (!text) throw new Error("Provider returned no text.");
    generationCircuit.succeed();
    return { text, interactionId: null };
  } catch (error) {
    console.warn("Gemini generation failed:", error instanceof Error ? error.message : String(error));
    generationCircuit.fail(classifyProviderError(error));
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
