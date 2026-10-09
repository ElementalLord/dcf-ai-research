import "server-only";
import * as cheerio from "cheerio";
import { fetchDiscoveryPreview } from "./live-fetch";
import { canonicalResearchUrl } from "./source-policy";
import { searchPolicyDecision, type SearchPolicy } from "./search-policy";
import { assertSafePublicUrl } from "@/lib/corpus/security";
import { normalizeForMatch } from "@/lib/corpus/text";

const lowQualityHost = /(?:^|\.)(?:quora\.com|reddit\.com|pinterest\.[a-z.]+|blogspot\.[a-z.]+|medium\.com|wikipedia\.org|facebook\.com)$/i;
const institutionalHost = /(?:^|\.)(?:edu|gov|ac\.[a-z]{2}|edu\.[a-z]{2}|gov\.[a-z]{2}|jstor\.org|cambridge\.org|oup\.com|oxfordacademic\.com|springer\.com|nature\.com|britannica\.com|archive\.org|gutenberg\.org|vedicheritage\.gov\.in)$/i;

export type CredibleSource = { url: string; domain: string; category: string; title: string };

const supportStop = new Set(["the", "and", "for", "with", "from", "that", "this", "his", "her", "their", "which", "into", "also", "about", "according", "tradition", "narrative", "source", "sources", "text", "texts"]);

/** Google selects a page and topic. Only a matching excerpt fetched from the
 * original page becomes evidence; the model's search summary stays discovery. */
export async function readGroundedExcerpt(source: CredibleSource, statement: string, aliases: string[], policy: SearchPolicy): Promise<{ text: string; title: string; url: string } | null> {
  const preview = await fetchDiscoveryPreview(source.url).catch(() => null);
  if (!preview?.html || preview.status !== 200 || !searchPolicyDecision(preview.finalUrl, policy).allowed) return null;
  const $ = cheerio.load(preview.html);
  $("script,style,nav,footer,header").remove();
  const body = $("body").text().replace(/\s+/g, " ").trim();
  const title = normalizeForMatch($("title").text());
  const names = [...new Set(aliases.map(normalizeForMatch).filter((name) => name.length >= 4))];
  const terms = [...new Set(normalizeForMatch(statement).split(" ").filter((term) => term.length >= 5 && !supportStop.has(term) && !names.some((name) => name.includes(term))))];
  const sentences = body.split(/(?<=[.!?])\s+/).filter((sentence) => sentence.length >= 25);
  const matches = sentences.map((sentence, index) => {
    const normalized = normalizeForMatch(sentence);
    const name = names.find((entry) => normalized.includes(entry));
    if (!name) return null;
    const context = sentence.length > 900
      ? sentence.slice(Math.max(0, normalized.indexOf(name) - 200), normalized.indexOf(name) + 500)
      : sentences.slice(Math.max(0, index - 1), index + 2).join(" ");
    const normalizedContext = normalizeForMatch(context);
    const overlap = terms.filter((term) => normalizedContext.includes(term) || (term.length > 6 && normalizedContext.includes(term.slice(0, -2)))).length;
    return { context, overlap };
  }).filter((item): item is { context: string; overlap: number } => Boolean(item)).sort((a, b) => b.overlap - a.overlap);
  if (!matches.length) return null;
  const best = matches[0];
  const academic = /cambridge|oxford|springer|jstor|nature/i.test(source.domain);
  if (academic && !names.some((name) => title.includes(name)) && best.overlap < 4) return null;
  if (best.overlap < Math.min(1, terms.length)) return null;
  return { text: best.context.slice(0, 600), title: $("title").text().replace(/\s+/g, " ").trim().slice(0, 200) || source.title, url: preview.finalUrl };
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
  if (initial.rule?.status === "allowed" || institutionalHost.test(host) || registryTrusted) {
    return { url, domain: host, category: initial.rule?.category || (registryTrusted ? "approved source family" : institutionalHost.test(host) ? "institutional" : "admin allowed"), title: title || host };
  }
  // Unknown domains are inspected at their original page. The preview uses the
  // same bounded HTTPS, redirect, and public-network checks as discovery.
  const preview = await fetchDiscoveryPreview(url).catch(() => null);
  if (!preview || preview.status !== 200 || !searchPolicyDecision(preview.finalUrl, policy).allowed) return null;
  const finalHost = new URL(preview.finalUrl).hostname;
  if (lowQualityHost.test(finalHost)) return null;
  if (institutionalHost.test(finalHost)) return { url: canonicalResearchUrl(preview.finalUrl), domain: finalHost, category: "institutional", title: title || finalHost };
  if (!preview.html) return null;
  const $ = cheerio.load(preview.html);
  const meta = (key: string) => $(`meta[name="${key}"],meta[property="${key}"]`).first().attr("content")?.trim() || "";
  const body = $("body").text().replace(/\s+/g, " ").slice(0, 20_000);
  if (/\b(?:written by ai|ai.generated|content farm)\b/i.test(body.slice(0, 3000))) return null;
  const namedWork = Boolean(meta("citation_title") || meta("dc.title"));
  const provenance = Boolean(meta("citation_author") || meta("dc.creator") || meta("citation_institution") || meta("citation_publisher") || meta("dc.publisher"));
  const scholarly = Boolean(meta("citation_doi") || meta("citation_journal_title") || meta("citation_book_title"));
  const institutional = /(?:university|institute|museum|library|archive|academy|research project|journal|press)/i.test(`${meta("og:site_name")} ${meta("dc.publisher")} ${meta("citation_publisher")}`);
  if (!((namedWork && provenance && (scholarly || institutional)) || (institutional && provenance && body.length > 900))) return null;
  return { url: canonicalResearchUrl(preview.finalUrl), domain: finalHost, category: scholarly ? "scholarly" : "institutional", title: title || meta("citation_title") || $("title").text().trim() || finalHost };
}
