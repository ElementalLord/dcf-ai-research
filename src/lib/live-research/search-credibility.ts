import "server-only";
import * as cheerio from "cheerio";
import { fetchDiscoveryPreview } from "./live-fetch";
import { canonicalResearchUrl } from "./source-policy";
import { searchPolicyDecision, type SearchPolicy } from "./search-policy";
import { assertSafePublicUrl } from "@/lib/corpus/security";
import { normalizeForMatch } from "@/lib/corpus/text";
import { readableEvidence } from "@/lib/corpus/readable-evidence";
import { classifySourceAuthority } from "@/lib/sources/authority";
import { extractPdf } from "@/lib/corpus/source-extract";

const lowQualityHost = /(?:^|\.)(?:quora\.com|reddit\.com|pinterest\.[a-z.]+|blogspot\.[a-z.]+|medium\.com|wikipedia\.org|facebook\.com|instagram\.com|tiktok\.com|brainyquote\.com|goodreads\.com)$/i;
const institutionalHost = /(?:^|\.)(?:edu|gov|ac\.[a-z]{2}|edu\.[a-z]{2}|gov\.[a-z]{2}|jstor\.org|cambridge\.org|oup\.com|oxfordacademic\.com|springer\.com|nature\.com|muse\.jhu\.edu|wiley\.com|tandfonline\.com|sagepub\.com|nobelprize\.org|ignca\.gov\.in|vedicheritage\.gov\.in|gretil\.sub\.uni-goettingen\.de|archive\.org|britannica\.com)$/i;

export function sourcePriority(rawUrl: string, title: string, question: string, category = ""): number {
  let host: string;
  try { host = new URL(rawUrl).hostname; } catch { return -100; }
  if (lowQualityHost.test(host)) return -100;
  const terms = normalizeForMatch(question).split(" ").filter((term) => term.length >= 4 && !supportStop.has(term));
  const normalizedTitle = normalizeForMatch(title);
  const relevance = terms.length ? terms.filter((term) => normalizedTitle.includes(term)).length / terms.length : 0;
  // Search widely, then rank by who published the page: authoritative first, general web last.
  const level = category === "trusted" ? "authoritative" : classifySourceAuthority({ url: rawUrl, sourceType: category, live: true }).level;
  const tier = level === "authoritative" ? 3 : level === "credible_secondary" || institutionalHost.test(host) || /scholarly|academic|primary|institutional/i.test(category) ? 2 : 0;
  return relevance * 8 + tier * 2;
}

export type CredibleSource = { url: string; domain: string; category: string; title: string };

type Preview = Awaited<ReturnType<typeof fetchDiscoveryPreview>>;
/** The readable text of one fetched source, by page for a PDF. Null means the request itself failed. */
type SourceText = { status: number; finalUrl: string; html: string; title: string; sections: Array<{ text: string; locator: string | null }> };
const MAX_SOURCE_CHARACTERS = 600_000;
const sourceTextCache = new Map<string, { expires: number; loaded: Promise<SourceText | null> }>();

async function readSourceText(preview: Preview): Promise<SourceText> {
  const base = { status: preview.status, finalUrl: preview.finalUrl, html: preview.html, title: "", sections: [] as SourceText["sections"] };
  if (preview.status !== 200) return base;
  if (preview.pdf) {
    // Text layer only (no OCR). A scanned PDF yields no text and so can never become evidence.
    const pages = await extractPdf(preview.pdf).catch(() => []);
    let budget = MAX_SOURCE_CHARACTERS;
    for (const page of pages) {
      if (budget <= 0) break;
      const text = page.text.replace(/\s+/g, " ").trim().slice(0, budget);
      budget -= text.length;
      if (text) base.sections.push({ text, locator: page.pageOrSection || null });
    }
    return base;
  }
  if (!preview.html) return base;
  const $ = cheerio.load(preview.html);
  const title = $("title").text().replace(/\s+/g, " ").trim().slice(0, 200);
  $("script,style,nav,footer,header").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();
  return { ...base, title, sections: text ? [{ text, locator: null }] : [] };
}

/** Several grounded statements usually cite the same page; fetch and parse each source once and share it briefly. */
function cachedSourceText(url: string): Promise<SourceText | null> {
  const now = Date.now();
  const hit = sourceTextCache.get(url);
  if (hit && hit.expires > now) return hit.loaded;
  if (sourceTextCache.size >= 30) sourceTextCache.delete(sourceTextCache.keys().next().value!);
  // A network failure is not remembered. A refusal (403 and similar) is, so a blocked site is asked only once.
  const loaded = fetchDiscoveryPreview(url).then(readSourceText).catch(() => { sourceTextCache.delete(url); return null; });
  sourceTextCache.set(url, { expires: now + 5 * 60_000, loaded });
  return loaded;
}

export type SourceAccess = "readable" | "blocked" | "unreadable";
/** Whether DCF could read a source. A refusal by the site is respected, never worked around. */
export async function sourceAccess(url: string): Promise<SourceAccess> {
  const loaded = await cachedSourceText(url);
  if (!loaded) return "unreadable";
  if ([401, 402, 403, 429, 451].includes(loaded.status)) return "blocked";
  return loaded.status === 200 && loaded.sections.length ? "readable" : "unreadable";
}

const supportStop = new Set(["the", "and", "for", "with", "from", "that", "this", "his", "her", "their", "which", "into", "also", "about", "according", "tradition", "narrative", "source", "sources", "text", "texts"]);

/** Google selects a page and topic. Only a matching excerpt fetched from the
 * original page becomes evidence; the model's search summary stays discovery. */
export async function readGroundedExcerpt(source: CredibleSource, statement: string, aliases: string[], policy: SearchPolicy): Promise<{ text: string; title: string; url: string; locator: string | null } | null> {
  const loaded = await cachedSourceText(source.url);
  if (!loaded || loaded.status !== 200 || !loaded.sections.length || !searchPolicyDecision(loaded.finalUrl, policy).allowed) return null;
  if (/\b(?:written by ai|ai.generated|content farm)\b/i.test(loaded.sections[0].text.slice(0, 3000))) return null;
  const title = normalizeForMatch(loaded.title);
  const names = [...new Set(aliases.map(normalizeForMatch).filter((name) => name.length >= 4))];
  const terms = [...new Set(normalizeForMatch(statement).split(" ").filter((term) => term.length >= 5 && !supportStop.has(term) && !names.some((name) => name.includes(term))))];
  const sentences = loaded.sections.flatMap((section) => section.text.split(/(?<=[.!?])\s+/).filter((sentence) => sentence.length >= 25).map((sentence) => ({ sentence, locator: section.locator })));
  const matches = sentences.map(({ sentence, locator }, index) => {
    const normalized = normalizeForMatch(sentence);
    const name = names.find((entry) => normalized.includes(entry));
    if (!name) return null;
    const context = sentence.length > 900
      ? sentence.slice(Math.max(0, normalized.indexOf(name) - 200), normalized.indexOf(name) + 500)
      : sentences.slice(Math.max(0, index - 1), index + 2).map((entry) => entry.sentence).join(" ");
    const normalizedContext = normalizeForMatch(context);
    const overlap = terms.filter((term) => normalizedContext.includes(term) || (term.length > 6 && normalizedContext.includes(term.slice(0, -2)))).length;
    return { context, overlap, locator };
  }).filter((item): item is { context: string; overlap: number; locator: string | null } => Boolean(item)).sort((a, b) => b.overlap - a.overlap);
  if (!matches.length) return null;
  const best = matches[0];
  const academic = /cambridge|oxford|springer|jstor|nature/i.test(source.domain);
  if (academic && !names.some((name) => title.includes(name)) && best.overlap < 4) return null;
  // Naming the person is relevance; sharing the statement's own terms is support. Both are required.
  if (best.overlap < Math.min(2, terms.length)) return null;
  const excerpt = readableEvidence(best.context.slice(0, 600));
  if (!excerpt) return null;
  return { text: excerpt, title: loaded.title || source.title, url: loaded.finalUrl, locator: best.locator };
}

export async function verifyGroundedStatement(source: CredibleSource, statement: string, aliases: string[], policy: SearchPolicy): Promise<boolean> {
  return Boolean(await readGroundedExcerpt(source, statement, aliases, policy));
}

export function isGoogleGroundingRedirect(rawUrl: string): boolean {
  try { const url = new URL(rawUrl); return url.protocol === "https:" && url.hostname === "vertexaisearch.cloud.google.com" && url.pathname.startsWith("/grounding-api-redirect/"); }
  catch { return false; }
}

export async function inspectSearchSource(rawUrl: string, policy: SearchPolicy, title = "", trustedDomains: string[] = []):
  Promise<CredibleSource | null> {
  if (isGoogleGroundingRedirect(rawUrl)) {
    try {
      const response = await fetch(rawUrl, { redirect: "manual", signal: AbortSignal.timeout(4_000) });
      const location = response.headers.get("location");
      if (response.status < 300 || response.status >= 400 || !location) return null;
      const original = canonicalResearchUrl(new URL(location, rawUrl).toString());
      if (isGoogleGroundingRedirect(original)) return null;
      await assertSafePublicUrl(original);
      return inspectSearchSource(original, policy, title, trustedDomains);
    } catch { return null; }
  }
  const initial = searchPolicyDecision(rawUrl, policy);
  if (!initial.allowed) return null;
  const url = canonicalResearchUrl(rawUrl);
  const host = new URL(url).hostname;
  if (lowQualityHost.test(host)) return null;
  const registryTrusted = trustedDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
  // Who published it is decided from the publisher, not from what metadata the page happens to expose.
  const recognized = (candidate: string) => classifySourceAuthority({ url: `https://${candidate}/`, live: true }, policy.rules).level !== "general_web" || institutionalHost.test(candidate);
  if (initial.rule?.status === "allowed" || registryTrusted || recognized(host)) {
    return { url, domain: host, category: initial.rule?.category || (registryTrusted ? "approved source family" : "institutional"), title: title || host };
  }
  // An unrecognized publisher has to identify itself on the page. Reading the page uses the
  // same bounded HTTPS, redirect, and public-network checks as every other discovery fetch.
  const loaded = await cachedSourceText(url);
  if (!loaded || loaded.status !== 200 || !searchPolicyDecision(loaded.finalUrl, policy).allowed) return null;
  const finalHost = new URL(loaded.finalUrl).hostname;
  if (lowQualityHost.test(finalHost)) return null;
  if (recognized(finalHost)) return { url: canonicalResearchUrl(loaded.finalUrl), domain: finalHost, category: "institutional", title: title || finalHost };
  if (!loaded.html) return null;
  const $ = cheerio.load(loaded.html);
  const meta = (key: string) => $(`meta[name="${key}"],meta[property="${key}"]`).first().attr("content")?.trim() || "";
  const body = $("body").text().replace(/\s+/g, " ").slice(0, 20_000);
  if (/\b(?:written by ai|ai.generated|content farm)\b/i.test(body.slice(0, 3000))) return null;
  const namedWork = Boolean(meta("citation_title") || meta("dc.title"));
  const provenance = Boolean(meta("citation_author") || meta("dc.creator") || meta("citation_institution") || meta("citation_publisher") || meta("dc.publisher"));
  const scholarly = Boolean(meta("citation_doi") || meta("citation_journal_title") || meta("citation_book_title"));
  const institutional = /(?:university|college|institute|museum|library|archive|academy|society|association|research project|journal|press|encyclop)/i.test(`${meta("og:site_name")} ${meta("dc.publisher")} ${meta("citation_publisher")}`);
  if (!((namedWork && provenance && (scholarly || institutional)) || (institutional && provenance && body.length > 900))) return null;
  return { url: canonicalResearchUrl(loaded.finalUrl), domain: finalHost, category: scholarly ? "scholarly" : "institutional", title: title || meta("citation_title") || loaded.title || finalHost };
}
