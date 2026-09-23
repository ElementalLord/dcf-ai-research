import { GoogleGenAI } from "@google/genai";
import { CorpusError, type CorpusErrorCode } from "./errors";

export const GENERATION_MODEL = process.env.GEMINI_GENERATION_MODEL || "gemini-3.6-flash";
let generationUnavailableUntil = 0;

function getClient(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) {
    throw new CorpusError("GEMINI_FAILED", "GEMINI_API_KEY is not configured.", 500);
  }
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

export async function generateText(
  prompt: string,
  options: { timeoutMs?: number; errorCode?: CorpusErrorCode } = {},
): Promise<{ text: string; interactionId: string | null }> {
  const timeoutMs = options.timeoutMs || 45_000;
  const errorCode = options.errorCode || "GEMINI_FAILED";
  if (Date.now() < generationUnavailableUntil) {
    throw new CorpusError(errorCode, "Gemini generation is temporarily unavailable.", 503);
  }
  const ai = getClient();
  async function withTimeout<T>(promise: Promise<T>, duration: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new CorpusError("REQUEST_TIMEOUT", "Gemini did not respond before the timeout.", 504)),
            duration,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  let interactionError: unknown;
  try {
    const response = await withTimeout(
      ai.interactions.create({ model: GENERATION_MODEL, input: prompt }),
      Math.min(timeoutMs, 15_000),
    );
    const text = response.output_text?.trim();
    if (!text) throw new CorpusError(errorCode, "Gemini returned no text.", 502);
    return { text, interactionId: response.id || null };
  } catch (error) {
    interactionError = error;
  }

  try {
    const response = await withTimeout(
      ai.models.generateContent({ model: GENERATION_MODEL, contents: prompt }),
      Math.min(Math.max(timeoutMs - 15_000, 5_000), 30_000),
    );
    const text = response.text?.trim();
    if (!text) throw new CorpusError(errorCode, "Gemini returned no text.", 502);
    return { text, interactionId: null };
  } catch (error) {
    generationUnavailableUntil = Date.now() + 60_000;
    throw new CorpusError(errorCode, "Gemini generation is temporarily unavailable.", 503, {
      cause: error || interactionError,
    });
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
