import { assertSafePublicUrl } from "@/lib/corpus/security";
import { normalizeForMatch } from "@/lib/corpus/text";
import type { WebSearchResult } from "./web-search-provider";

const scientific = /\b(?:physics|chemistry|biology|medicine|medical|scientific|science|research|discovery|disease|health|drug|nobel prize)\b/i;
const stop = new Set(["what", "which", "when", "where", "year", "date", "was", "were", "did", "does", "the", "and", "for", "with", "from", "into", "about", "awarded", "received", "receive"]);

function namedTopic(question: string, aliases: string[]): string | null {
  const names = aliases.map(normalizeForMatch);
  const matches = question.match(/\b[A-Z][a-z]+(?:\s+(?:(?:in|of|the|for|and)\s+)?[A-Z][a-z]+){1,4}\b/g) || [];
  return matches.filter((value) => !names.some((name) => name.includes(normalizeForMatch(value))))
    .sort((a, b) => b.length - a.length)[0] || null;
}

/** PMC ESearch is an official, free discovery API. Its IDs are only leads;
 * the OAI full-text reader separately checks each article and its rights. */
export async function searchPmcArticles(personality: string, aliases: string[], question: string,
  fetchImpl: typeof fetch = fetch, validate: typeof assertSafePublicUrl = assertSafePublicUrl): Promise<WebSearchResult[]> {
  if (!scientific.test(question)) return [];
  const names = [personality, ...aliases].map(normalizeForMatch)
    .filter((name) => name.split(" ").length >= 2 && name.length <= 100 && !name.startsWith("sir "));
  const fullName = names.sort((a, b) => b.length - a.length)[0];
  if (!fullName) return [];
  const topic = namedTopic(question, names);
  const nameWords = new Set(fullName.split(" "));
  const focus = normalizeForMatch(question).split(" ")
    .filter((word) => word.length >= 4 && !stop.has(word) && !nameWords.has(word)).slice(0, 3);
  if (!topic && !focus.length) return [];
  const term = `"${fullName}" ${topic ? `"${topic}"` : focus.join(" ")}`;
  const url = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi");
  for (const [key, value] of Object.entries({ db: "pmc", term, retmax: "4", retmode: "json", sort: "relevance" })) url.searchParams.set(key, value);
  const safe = await validate(url.toString());
  const response = await fetchImpl(safe, { redirect: "error", signal: AbortSignal.timeout(8_000),
    headers: { Accept: "application/json", "User-Agent": "DCF-AI-Research/1.0 (+controlled-source-research)" } });
  if (!response.ok || !/application\/json/i.test(response.headers.get("content-type") || "")
    || Number(response.headers.get("content-length") || 0) > 64_000) return [];
  const body = await response.text();
  if (body.length > 64_000) return [];
  const payload: unknown = JSON.parse(body);
  const ids = (payload as { esearchresult?: { idlist?: unknown } } | null)?.esearchresult?.idlist;
  if (!Array.isArray(ids)) return [];
  return ids.filter((id): id is string => typeof id === "string" && /^[1-9][0-9]{0,11}$/.test(id)).slice(0, 4)
    .map((id) => ({ title: `PMC article ${id}`, url: `https://pmc.ncbi.nlm.nih.gov/articles/PMC${id}/`, sourceProvider: "pmc" }));
}
