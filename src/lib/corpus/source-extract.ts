import * as cheerio from "cheerio";
import { PDFParse } from "pdf-parse";
import type { DocumentSection } from "./types";
import { CorpusError } from "./errors";
import { normalizeWhitespace } from "./text";
import { fetchApprovedResource } from "@/lib/live-research/live-fetch";
import { loadActiveSourceRules } from "@/lib/live-research/source-registry";

const MAX_PDF_BYTES = 20 * 1024 * 1024;

export function sectionsFromHtml(html: string, finalUrl?: string): DocumentSection[] {
  const $ = cheerio.load(html);
  const verseRows = $("li").filter((_, element) => {
    const ref = $(element).find("span").first().text().trim();
    return /^\d{1,3}\.\d{1,3}$/.test(ref) && $(element).find("p[lang='sa']").length > 0;
  });
  if (verseRows.length >= 10) {
    const chapter = finalUrl ? new URL(finalUrl).pathname.match(/\/(\d{1,3})\/?$/)?.[1] : null;
    const title = $("title").first().text().trim() || null;
    return verseRows.toArray().map((element) => {
      const row = $(element);
      const verse = row.find("span").first().text().trim();
      const reference = chapter ? `${chapter}.${verse}` : verse;
      return { title, pageOrSection: reference, text: normalizeWhitespace(row.find("p").map((_, p) => $(p).text()).get().join("\n")),
        metadata: { verseReference: reference } };
    }).filter((section) => section.text.length > 0);
  }
  $("script,style,noscript,nav,footer,header,aside,form,svg,canvas,iframe").remove();
  const root = $("main,article,[role='main']").first().length
    ? $("main,article,[role='main']").first()
    : $("body");
  const sections: DocumentSection[] = [];
  let title = $("title").first().text().trim() || null;
  let parts: string[] = [];
  const flush = () => {
    const text = normalizeWhitespace(parts.join("\n\n"));
    if (text) sections.push({ title, pageOrSection: title, text });
    parts = [];
  };
  root.find("h1,h2,h3,h4,h5,h6,p,blockquote,pre,li,dt,dd").each((_, element) => {
    const tag = element.tagName.toLowerCase();
    const text = normalizeWhitespace($(element).text());
    if (!text) return;
    if (/^h[1-6]$/.test(tag)) {
      flush();
      title = text;
    } else if (text.length >= 20 || tag === "pre" || tag === "blockquote") {
      parts.push(text);
    }
  });
  flush();
  return sections;
}

export async function extractRemoteBytes(
  bytes: Uint8Array,
  contentTypeValue: string,
  finalUrl: string,
): Promise<DocumentSection[]> {
  const contentType = contentTypeValue.toLowerCase();
  if (contentType.includes("application/pdf") || finalUrl.toLowerCase().endsWith(".pdf")) {
    return extractPdf(bytes);
  }
  if (!contentType.includes("text/html") && !contentType.includes("text/plain") && !contentType.includes("application/xhtml+xml")) {
    throw new CorpusError("UNSUPPORTED_CONTENT_TYPE", `Unsupported source content type: ${contentType || "unknown"}.`, 415);
  }
  const decoded = new TextDecoder().decode(bytes);
  const sections = contentType.includes("text/plain")
    ? [{ title: null, pageOrSection: null, text: decoded }]
    : sectionsFromHtml(decoded, finalUrl);
  if (!sections.some((section) => section.text.trim())) {
    throw new CorpusError("NO_TEXT_EXTRACTED", "No useful text could be extracted from the source URL.", 422);
  }
  return sections;
}

export async function extractUrl(rawUrl: string): Promise<{
  sections: DocumentSection[];
  contentType: string;
  finalUrl: string;
}> {
  const rules = await loadActiveSourceRules();
  const response = await fetchApprovedResource(rawUrl, {
    rules,
    requireEvidenceApproval: false,
    capability: "ingest",
  });
  if (!response.bytes) throw new CorpusError("NO_TEXT_EXTRACTED", "The approved source returned no content.", 422);
  const sections = await extractRemoteBytes(response.bytes, response.contentType, response.finalUrl);
  return { sections, contentType: response.contentType, finalUrl: response.finalUrl };
}

/**
 * Printed page numbers from running heads/footers. Labels are only trusted when one constant
 * offset from the PDF index explains at least 60% of the pages; otherwise the PDF index is kept.
 */
export function printedPageLabels(pages: Array<{ num: number; text: string }>): Map<number, string> {
  const offsets = new Map<number, number>();
  for (const page of pages) {
    const edges = [page.text.trim().match(/^(\d{1,4})\b/)?.[1], page.text.trim().match(/\b(\d{1,4})$/)?.[1]];
    for (const value of new Set(edges.filter(Boolean))) {
      const offset = Number(value) - page.num;
      offsets.set(offset, (offsets.get(offset) || 0) + 1);
    }
  }
  const [offset, count] = [...offsets].sort((a, b) => b[1] - a[1])[0] || [0, 0];
  const labels = new Map<number, string>();
  if (pages.length < 3 || count < Math.max(3, pages.length * 0.6)) return labels;
  for (const page of pages) if (page.num + offset > 0) labels.set(page.num, `p. ${page.num + offset}${offset ? ` (PDF page ${page.num})` : ""}`);
  return labels;
}

export async function extractPdf(data: Uint8Array): Promise<DocumentSection[]> {
  if (data.byteLength > MAX_PDF_BYTES) throw new CorpusError("PDF_PARSE_FAILED", "The PDF exceeds the 20 MB limit.", 413);
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    const printed = printedPageLabels(result.pages);
    const sections = result.pages
      .map((page) => ({ title: `Page ${page.num}`, pageOrSection: printed.get(page.num) || `Page ${page.num}`, text: page.text }))
      .filter((page) => page.text.trim());
    if (sections.length === 0) throw new CorpusError("NO_TEXT_EXTRACTED", "The PDF did not contain extractable text.", 422);
    return sections;
  } catch (error) {
    if (error instanceof CorpusError) throw error;
    throw new CorpusError("PDF_PARSE_FAILED", "The PDF could not be parsed reliably.", 422, { cause: error });
  } finally {
    await parser.destroy();
  }
}
