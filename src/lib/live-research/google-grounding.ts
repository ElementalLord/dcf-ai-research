import "server-only";
import { GoogleGenAI } from "@google/genai";
import { boundedProviderCall, classifyProviderError } from "@/lib/corpus/provider-health";
import { GENERATION_MODEL } from "@/lib/corpus/gemini";
import type { RetrievedPassage } from "@/lib/corpus/types";

export type GroundingResult = {
  evidence: RetrievedPassage[];
  requests: number;
  queries: number;
  latencyMs: number;
  errorCategory: string | null;
};

// Search result placement is not a quality signal. Admit only recognizable source families;
// unknown sources can still be discovered by the existing Brave verification path.
const credibleHost = /(?:^|\.)(?:edu|gov|ac\.uk|ac\.in|edu\.au|org\.uk|britannica\.com|encyclopedia\.com|jstor\.org|cambridge\.org|oup\.com|oxfordacademic\.com|springer\.com|nature\.com|sacred-texts\.com|archive\.org|gutenberg\.org|wisdomlib\.org|vedicheritage\.gov\.in)$/i;
const groundingCache = new Map<string, { expires: number; result: GroundingResult }>();
const poorSource = /(?:^|\.)(?:quora\.com|pinterest\.[a-z.]+|reddit\.com|blogspot\.[a-z.]+|medium\.com)$/i;

export function credibleGroundingUrl(raw: string): { url: string; institution: string } | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || poorSource.test(url.hostname) || !credibleHost.test(url.hostname)) return null;
    return { url: url.toString(), institution: url.hostname.replace(/^www\./, "") };
  } catch { return null; }
}

export function groundedPassages(response: { candidates?: Array<{ groundingMetadata?: {
  groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
  groundingSupports?: Array<{ segment?: { text?: string }; groundingChunkIndices?: number[] }>;
  webSearchQueries?: string[];
} }> }, personalityId: string, personalityName: string): RetrievedPassage[] {
  const metadata = response.candidates?.[0]?.groundingMetadata;
  if (!metadata) return [];
  const chunks = metadata.groundingChunks || [];
  const passages = new Map<string, RetrievedPassage>();
  for (const support of metadata.groundingSupports || []) {
    const statement = support.segment?.text?.replace(/\[[^\]]+\]/g, "").trim();
    if (!statement || statement.length < 25) continue;
    for (const index of support.groundingChunkIndices || []) {
      const web = chunks[index]?.web;
      if (!web?.uri || !web.title) continue;
      const verified = credibleGroundingUrl(web.uri);
      if (!verified) continue;
      const key = `${verified.url}|${statement}`;
      if (passages.has(key)) continue;
      passages.set(key, {
        kind: "passage", id: `google:${index}:${passages.size}`, chunkId: `google:${index}:${passages.size}`,
        sourceId: `google:${index}`, text: statement.slice(0, 500), sectionTitle: null, pageOrSection: null,
        textualLayer: "Search-grounded summary; verify tradition or historical status in the source",
        sourceTitle: web.title, sourceAuthor: null, sourceInstitution: verified.institution,
        sourceUrl: verified.url, sourceType: "live web research", sourceStatus: "discovered",
        personalityId, personalityName, origin: "google_grounding", retrievedAt: new Date().toISOString(),
      });
      if (passages.size >= 8) return [...passages.values()];
    }
  }
  return [...passages.values()];
}

export async function searchWithGoogleGrounding(question: string, personalityId: string, personalityName: string, depth: "normal" | "research" = "normal"): Promise<GroundingResult> {
  const started = performance.now();
  const cacheKey = `${personalityId}|${depth}|${question.normalize("NFKC").trim().toLowerCase()}`;
  const cached = groundingCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return { ...cached.result, requests: 0, queries: 0, latencyMs: 0 };
  const empty = (errorCategory: string | null, requests = 0, queries = 0): GroundingResult => ({ evidence: [], requests, queries, latencyMs: Math.round(performance.now() - started), errorCategory });
  if (!process.env.GEMINI_API_KEY) return empty("NOT_CONFIGURED");
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await boundedProviderCall((abortSignal) => ai.models.generateContent({
      model: GENERATION_MODEL,
      contents: `Research this question about ${personalityName}: ${question}\nFind ${depth === "research" ? "a few" : "one or two"} credible primary, academic, institutional, or reference sources. Give concise factual findings and distinguish textual tradition from historical evidence. Do not use blogs, forums, or unsourced summaries.`,
      config: { tools: [{ googleSearch: {} }], abortSignal, maxOutputTokens: 1000,
        httpOptions: { retryOptions: { attempts: 1 } } },
    }), depth === "research" ? 16000 : 11000);
    const metadata = response.candidates?.[0]?.groundingMetadata;
    const evidence = groundedPassages(response, personalityId, personalityName);
    const queries = metadata?.webSearchQueries?.length || 0;
    const result = { evidence, requests: 1, queries, latencyMs: Math.round(performance.now() - started), errorCategory: evidence.length ? null : "NO_CREDIBLE_GROUNDED_EVIDENCE" };
    if (evidence.length) {
      if (groundingCache.size >= 100) groundingCache.delete(groundingCache.keys().next().value!);
      groundingCache.set(cacheKey, { expires: Date.now() + 10 * 60_000, result });
    }
    return result;
  } catch (error) {
    return empty(classifyProviderError(error), 1);
  }
}
