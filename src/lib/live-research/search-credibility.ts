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
import { canonicalRetentionRights, hasExplicitRetentionRights } from "./retention-rights";
import { assessPassageSupport, authenticateSource, evidenceTypeFor, isBroadIdeaQuestion, type PassageSupport, type SourceIdentity } from "./research-quality";

const lowQualityHost = /(?:^|\.)(?:quora\.com|reddit\.com|pinterest\.[a-z.]+|blogspot\.[a-z.]+|medium\.com|wikipedia\.org|facebook\.com|instagram\.com|tiktok\.com|brainyquote\.com|goodreads\.com)$/i;
const institutionalHost = /(?:^|\.)(?:edu|gov|ac\.[a-z]{2}|edu\.[a-z]{2}|gov\.[a-z]{2}|jstor\.org|cambridge\.org|oup\.com|oxfordacademic\.com|springer\.com|nature\.com|muse\.jhu\.edu|wiley\.com|tandfonline\.com|sagepub\.com|nobelprize\.org|ignca\.gov\.in|vedicheritage\.gov\.in|gretil\.sub\.uni-goettingen\.de|archive\.org|britannica\.com)$/i;

export function sourcePriority(rawUrl: string, title: string, question: string, category = "", snippet = ""): number {
  let host: string;
  try { host = new URL(rawUrl).hostname; } catch { return -100; }
  if (lowQualityHost.test(host)) return -100;
  const terms = normalizeForMatch(question).split(" ").filter((term) => term.length >= 4 && !supportStop.has(term));
  const normalizedTitle = normalizeForMatch(title);
  const relevance = terms.length ? terms.filter((term) => normalizedTitle.includes(term)).length / terms.length : 0;
  // Eligibility and relevance precede publisher standing. A prestigious but irrelevant page
  // cannot outrank a directly relevant page from a merely credible publisher.
  const level = category === "trusted" ? "authoritative" : classifySourceAuthority({ url: rawUrl, sourceType: category, live: true }).level;
  const tier = level === "authoritative" ? 3 : level === "credible_secondary" || institutionalHost.test(host) || /scholarly|academic|primary|institutional/i.test(category) ? 2 : 0;
  if (terms.length >= 2 && relevance === 0) return tier ? -1 : -10;
  // A result snippet may hint at an article's license for ordering only. The
  // original page must still declare rights before any passage is retained.
  const licenseUrl = snippet.match(/https:\/\/creativecommons\.org\/(?:licenses|publicdomain)\/[^\s)]+/i)?.[0]?.replace(/[.,;]+$/, "");
  const articleRightsHint = /\b(?:this article|this chapter|this work|article license|chapter license)\b.{0,160}creativecommons\.org\//i.test(snippet)
    && hasExplicitRetentionRights(licenseUrl);
  return relevance * 20 + tier * 2 + (articleRightsHint ? 4 : 0);
}

export type CredibleSource = { url: string; domain: string; category: string; title: string };

type Preview = Awaited<ReturnType<typeof fetchDiscoveryPreview>>;
/** The readable text of one fetched source, by page for a PDF. Null means the request itself failed. */
type SourceText = { status: number; finalUrl: string; html: string; title: string; identity: SourceIdentity; rightsDeclaration: string | null; sections: Array<{ text: string; locator: string | null }> };
const MAX_SOURCE_CHARACTERS = 600_000;
const sourceTextCache = new Map<string, { expires: number; loaded: Promise<SourceText | null> }>();

async function readSourceText(preview: Preview): Promise<SourceText> {
  const emptyIdentity = authenticateSource({ url: preview.finalUrl });
  const base = { status: preview.status, finalUrl: preview.finalUrl, html: preview.html, title: "", identity: emptyIdentity, rightsDeclaration: null as string | null, sections: [] as SourceText["sections"] };
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
    return { ...base, identity: authenticateSource({ url: preview.finalUrl, title: preview.finalUrl.split("/").at(-1), sourceType: "scholarly document" }) };
  }
  if (!preview.html) return base;
  const $ = cheerio.load(preview.html);
  const title = $("title").text().replace(/\s+/g, " ").trim().slice(0, 200);
  const meta = (key: string) => $(`meta[name="${key}"],meta[property="${key}"]`).first().attr("content")?.trim() || null;
  const identity = authenticateSource({ url: preview.finalUrl, title: meta("citation_title") || meta("dc.title") || title,
    author: meta("citation_author") || meta("dc.creator"), publisher: meta("citation_publisher") || meta("dc.publisher") || meta("og:site_name"),
    publicationDate: meta("citation_publication_date") || meta("citation_date") || meta("dc.date"), journal: meta("citation_journal_title"),
    doi: meta("citation_doi"), isbn: meta("citation_isbn"), sourceType: meta("citation_journal_title") ? "scholarly journal" : null });
  $("script,style,nav,footer,header").remove();
  const chooseLargest = (selector: string) => $(selector).toArray()
    .sort((a, b) => $(b).text().length - $(a).text().length)[0];
  const root = $(chooseLargest("main,[role='main']") || chooseLargest("article") || $("body").get(0));
  const sections: SourceText["sections"] = [];
  let heading = identity.title || title || preview.finalUrl;
  let parts: string[] = [];
  const flush = () => {
    const value = parts.join(" ").replace(/\s+/g, " ").trim().slice(0, MAX_SOURCE_CHARACTERS);
    if (value) sections.push({ text: value, locator: heading });
    parts = [];
  };
  root.find("h1,h2,h3,h4,h5,h6,p,blockquote,li").each((_, element) => {
    const value = $(element).text().replace(/\s+/g, " ").trim();
    if (/^h[1-6]$/.test(element.tagName)) { flush(); if (value && !/^information$/i.test(value)) heading = value; }
    else if (value.length >= 20) {
      // Keep paragraph boundaries: a name in one paragraph must not authenticate
      // an unrelated date or event in the next paragraph.
      parts.push(value);
      flush();
    }
  });
  flush();
  if (!sections.length) {
    const text = root.text().replace(/\s+/g, " ").trim().slice(0, MAX_SOURCE_CHARACTERS);
    if (text) sections.push({ text, locator: heading });
  }
  // Some publishers state the article's CC licence in its own rights panel
  // rather than machine-readable metadata. Require article-specific wording
  // beside the licence link; a generic site footer is not a grant for the work.
  const articleLicense = $("a[href*='creativecommons.org/licenses/'],a[href*='creativecommons.org/publicdomain/']")
    .map((_, element) => {
      let context = $(element);
      for (let depth = 0; depth < 6; depth++, context = context.parent()) {
        const text = context.text().replace(/\s+/g, " ").trim();
        if (text.length > 1500) break;
        if (/\b(?:this article is licensed|this is an? open[- ]access article.{0,100}distributed)\b/i.test(text))
          return $(element).attr("href") || null;
      }
      return null;
    }).get().find(Boolean) || null;
  const rightsDeclaration = canonicalRetentionRights(meta("dc.rights") || meta("dcterms.rights") || meta("citation_license") || meta("license")
    || $("link[rel~='license']").first().attr("href") || articleLicense);
  return { ...base, title, identity, rightsDeclaration, sections };
}

/** Several grounded statements usually cite the same page; fetch and parse each source once and share it briefly. */
function cachedSourceText(url: string): Promise<SourceText | null> {
  const now = Date.now();
  const hit = sourceTextCache.get(url);
  if (hit && hit.expires > now) return hit.loaded;
  if (sourceTextCache.size >= 30) sourceTextCache.delete(sourceTextCache.keys().next().value!);
  // A network failure is not remembered. A refusal (403 and similar) is, so a blocked site is asked only once.
  const loaded = fetchDiscoveryPreview(url).then(readSourceText).then((value) => {
    // Share an in-flight read, but never keep unlicensed original text in the cache.
    if (value.status === 200 && value.sections.length && !hasExplicitRetentionRights(value.rightsDeclaration))
      sourceTextCache.delete(url);
    return value;
  }).catch(() => { sourceTextCache.delete(url); return null; });
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
export async function readGroundedExcerpt(source: CredibleSource, statement: string, aliases: string[], policy: SearchPolicy): Promise<{ text: string; title: string; url: string; locator: string | null; supportLevel: PassageSupport; supportReason: string; identity: SourceIdentity; rightsDeclaration: string | null } | null> {
  const loaded = await cachedSourceText(source.url);
  if (!loaded || loaded.status !== 200 || !loaded.sections.length || !searchPolicyDecision(loaded.finalUrl, policy).allowed) return null;
  if (/\b(?:written by ai|ai.generated|content farm)\b/i.test(loaded.sections[0].text.slice(0, 3000))) return null;
  const title = normalizeForMatch(loaded.title);
  const fullNames = [...new Set(aliases.map(normalizeForMatch).filter((name) => name.length >= 4))];
  // A biography title can identify later paragraphs that use only the subject's
  // surname. This does not add a globally ambiguous personality alias.
  const surname = fullNames[0]?.split(" ").at(-1) || "";
  const titleIdentifiesSubject = fullNames.some((name) => name.includes(" ") && title.includes(name));
  const names = [...new Set([...fullNames, ...(titleIdentifiesSubject && surname.length >= 4 ? [surname] : [])])];
  const terms = [...new Set(normalizeForMatch(statement).split(" ").filter((term) => term.length >= 5 && !supportStop.has(term) && !names.some((name) => name.includes(term))))];
  const matches = loaded.sections.flatMap((section) => {
    const sentences = section.text.split(/(?<=[.!?])\s+/).filter((sentence) => sentence.length >= 25);
    return sentences.map((_, index) => {
      // A scholarly paragraph often identifies its subject first, then states a
      // scholar's dated view two sentences later. Keep the support sentence and
      // its subject together, but never borrow identity from another paragraph.
      const context = sentences.slice(Math.max(0, index - 2), Math.min(sentences.length, index + 2)).join(" ").slice(0, 900);
      const normalizedContext = normalizeForMatch(context);
      if (!names.some((entry) => normalizedContext.includes(entry))) return null;
      const overlap = terms.filter((term) => normalizedContext.includes(term) || (term.length > 6 && normalizedContext.includes(term.slice(0, -2)))).length;
      const support = assessPassageSupport(context, statement, aliases[0] || "", names.slice(1));
      return { context, overlap, locator: section.locator, support };
    });
  }).filter((item): item is { context: string; overlap: number; locator: string | null; support: ReturnType<typeof assessPassageSupport> } => Boolean(item))
    .sort((a, b) => ({ EXACT: 4, STRONG: 3, PARTIAL: 2, RELATED: 1 }[b.support.level] - { EXACT: 4, STRONG: 3, PARTIAL: 2, RELATED: 1 }[a.support.level]) || b.overlap - a.overlap);
  if (!matches.length) return null;
  const best = matches[0];
  const academic = /cambridge|oxford|springer|jstor|nature/i.test(source.domain);
  const broadIdeaSupport = isBroadIdeaQuestion(statement) && best.support.level === "STRONG";
  if (academic && !names.some((name) => title.includes(name)) && best.overlap < 4 && !broadIdeaSupport) return null;
  // Naming the person is relevance; sharing the statement's own terms is support. Both are required.
  if ((!broadIdeaSupport && best.overlap < Math.min(2, terms.length)) || !["EXACT", "STRONG"].includes(best.support.level)) return null;
  const excerpt = readableEvidence(best.context.slice(0, 600));
  if (!excerpt) return null;
  const identity = loaded.identity.title ? loaded.identity : authenticateSource({ url: loaded.finalUrl, title: loaded.title || source.title, category: source.category });
  return { text: excerpt, title: loaded.title || source.title, url: loaded.finalUrl, locator: best.locator,
    rightsDeclaration: loaded.rightsDeclaration,
    supportLevel: best.support.level, supportReason: best.support.reason,
    identity: { ...identity, evidenceType: identity.evidenceType === "general_web" ? evidenceTypeFor({ category: source.category }) : identity.evidenceType } };
}

export async function verifyGroundedStatement(source: CredibleSource, statement: string, aliases: string[], policy: SearchPolicy): Promise<boolean> {
  return Boolean(await readGroundedExcerpt(source, statement, aliases, policy));
}

export function isGoogleGroundingRedirect(rawUrl: string): boolean {
  try { const url = new URL(rawUrl); return url.protocol === "https:" && url.hostname === "vertexaisearch.cloud.google.com" && url.pathname.startsWith("/grounding-api-redirect/"); }
  catch { return false; }
}

export async function inspectSearchSource(rawUrl: string, policy: SearchPolicy, title = "", trustedDomains: string[] = [], trustedExactUrl: string | null = null):
  Promise<CredibleSource | null> {
  if (isGoogleGroundingRedirect(rawUrl)) {
    try {
      const response = await fetch(rawUrl, { redirect: "manual", signal: AbortSignal.timeout(4_000) });
      const location = response.headers.get("location");
      if (response.status < 300 || response.status >= 400 || !location) return null;
      const original = canonicalResearchUrl(new URL(location, rawUrl).toString());
      if (isGoogleGroundingRedirect(original)) return null;
      await assertSafePublicUrl(original);
      return inspectSearchSource(original, policy, title, trustedDomains, trustedExactUrl);
    } catch { return null; }
  }
  const initial = searchPolicyDecision(rawUrl, policy);
  if (!initial.allowed) return null;
  const url = canonicalResearchUrl(rawUrl);
  const host = new URL(url).hostname;
  if (lowQualityHost.test(host)) return null;
  const registryTrusted = trustedDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
  const exactUrlTrusted = trustedExactUrl !== null && url === canonicalResearchUrl(trustedExactUrl);
  // Who published it is decided from the publisher, not from what metadata the page happens to expose.
  const recognized = (candidate: string) => classifySourceAuthority({ url: `https://${candidate}/`, live: true }, policy.rules).level !== "general_web" || institutionalHost.test(candidate);
  if (initial.rule?.status === "allowed" || registryTrusted || exactUrlTrusted || recognized(host)) {
    return { url, domain: host, category: initial.rule?.category || (exactUrlTrusted ? "approved exact source" : registryTrusted ? "approved source family" : "institutional"), title: title || host };
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
