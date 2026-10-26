import * as cheerio from "cheerio";
import { assertSafePublicUrl } from "@/lib/corpus/security";
import { authenticateSource } from "./research-quality";
import { canonicalRetentionRights } from "./retention-rights";

const articlePath = /^\/articles\/(PMC[1-9][0-9]{0,11})\/?$/i;
const maxXmlBytes = 2 * 1024 * 1024;
let nextPmcRequestAt = 0;

async function pacePmcRequest(): Promise<void> {
  const now = Date.now();
  const start = Math.max(now, nextPmcRequestAt);
  nextPmcRequestAt = start + 400; // PMC documents a limit of three requests per second.
  if (start > now) await new Promise((resolve) => setTimeout(resolve, start - now));
}

export function pmcArticleId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || url.hostname !== "pmc.ncbi.nlm.nih.gov") return null;
    return url.pathname.match(articlePath)?.[1].toUpperCase() || null;
  } catch { return null; }
}

async function fetchArticleXml(rawUrl: string, timeoutMs: number, fetchImpl: typeof fetch,
  validate: typeof assertSafePublicUrl): Promise<string | null> {
  try {
    const safe = await validate(rawUrl);
    if (fetchImpl === fetch) await pacePmcRequest();
    const response = await fetchImpl(safe, { redirect: "error", signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: "application/xml,text/xml", "User-Agent": "DCF-AI-Research/1.0 (+controlled-source-research)" } });
    if (!response.ok || !/^(?:application|text)\/xml(?:;|$)/i.test(response.headers.get("content-type") || "")
      || Number(response.headers.get("content-length") || 0) > maxXmlBytes) return null;
    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxXmlBytes) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    return new TextDecoder().decode(Buffer.concat(chunks));
  } catch { return null; }
}

function parseArticleXml(xml: string, id: string, rawUrl: string) {
  const $ = cheerio.load(xml, { xmlMode: true });
  const article = $("article").first();
  if (!article.length || article.find('article-id[pub-id-type="pmcid"]').first().text().toUpperCase() !== id) return null;
  const title = article.find("article-meta > title-group > article-title").first().text().replace(/\s+/g, " ").trim();
  const authorNode = article.find('article-meta > contrib-group > contrib[contrib-type="author"]').first();
  const author = [authorNode.find("given-names").first().text(), authorNode.find("surname").first().text()].filter(Boolean).join(" ");
  const publisher = article.find("journal-meta > publisher > publisher-name").first().text().trim();
  const journal = article.find("journal-meta > journal-title-group > journal-title").first().text().trim();
  const doi = article.find('article-meta > article-id[pub-id-type="doi"]').first().text().trim();
  const year = article.find('article-meta > pub-date[pub-type="epub"] > year, article-meta > pub-date > year').first().text().trim();
  const license = article.find("article-meta > permissions > license").first();
  const rightsDeclaration = canonicalRetentionRights(license.find("ali\\:license_ref, license_ref").first().text().trim()
    || license.attr("xlink:href") || license.find('ext-link[href*="creativecommons.org"], ext-link[xlink\\:href*="creativecommons.org"]').first().attr("xlink:href") || null);
  const sections = article.find("body p").toArray().map((node) => ({
    text: $(node).text().replace(/\s+/g, " ").trim().slice(0, 5_000),
    locator: $(node).closest("sec").children("title").first().text().replace(/\s+/g, " ").trim() || title,
  })).filter((section) => section.text.length >= 20).slice(0, 800);
  if (!title || !sections.length) return null;
  return { status: 200, finalUrl: `https://pmc.ncbi.nlm.nih.gov/articles/${id}/`, html: "", title,
    identity: authenticateSource({ url: rawUrl, title, author, publisher, journal, doi, publicationDate: year, sourceType: "scholarly journal" }),
    rightsDeclaration, sections };
}

/** Both official endpoints serve only their open-access full-text subset.
 * Article-specific rights and PMCID are checked from the XML itself. */
export async function readPmcOpenArticle(rawUrl: string, fetchImpl: typeof fetch = fetch, validate: typeof assertSafePublicUrl = assertSafePublicUrl) {
  const id = pmcArticleId(rawUrl);
  if (!id) return null;
  const europePmc = `https://www.ebi.ac.uk/europepmc/webservices/rest/${id}/fullTextXML`;
  const primary = await fetchArticleXml(europePmc, 7_000, fetchImpl, validate);
  if (primary) {
    const parsed = parseArticleXml(primary, id, rawUrl);
    if (parsed) return parsed;
  }
  const oai = new URL("https://pmc.ncbi.nlm.nih.gov/api/oai/v1/mh/");
  oai.searchParams.set("verb", "GetRecord");
  oai.searchParams.set("identifier", `oai:pubmedcentral.nih.gov:${id.slice(3)}`);
  oai.searchParams.set("metadataPrefix", "pmc");
  const fallback = await fetchArticleXml(oai.toString(), 8_000, fetchImpl, validate);
  return fallback ? parseArticleXml(fallback, id, rawUrl) : null;
}
