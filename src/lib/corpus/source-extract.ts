import * as cheerio from "cheerio";
import { PDFParse } from "pdf-parse";
import type { DocumentSection } from "./types";
import { CorpusError } from "./errors";
import { assertSafePublicUrl } from "./security";
import { normalizeWhitespace } from "./text";

const MAX_REMOTE_BYTES = 15 * 1024 * 1024;
const MAX_PDF_BYTES = 20 * 1024 * 1024;

async function safeFetch(rawUrl: string, redirects = 0): Promise<Response> {
  if (redirects > 5) throw new CorpusError("FETCH_FAILED", "The source URL redirected too many times.", 422);
  const url = await assertSafePublicUrl(rawUrl);
  const response = await fetch(url, {
    redirect: "manual",
    headers: { "User-Agent": "DCF-AI-Research-Corpus/1.0" },
    signal: AbortSignal.timeout(20_000),
  }).catch((error) => {
    throw new CorpusError("FETCH_FAILED", "The source URL could not be fetched.", 422, { cause: error });
  });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) throw new CorpusError("FETCH_FAILED", "The source redirected without a destination.", 422);
    return safeFetch(new URL(location, url).toString(), redirects + 1);
  }
  if (!response.ok) {
    throw new CorpusError("FETCH_FAILED", `The source returned HTTP ${response.status}.`, 422);
  }
  const size = Number(response.headers.get("content-length") || 0);
  if (size > MAX_REMOTE_BYTES) throw new CorpusError("FETCH_FAILED", "The remote source exceeds the 15 MB limit.", 413);
  return response;
}

function sectionsFromHtml(html: string): DocumentSection[] {
  const $ = cheerio.load(html);
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

export async function extractUrl(rawUrl: string): Promise<{
  sections: DocumentSection[];
  contentType: string;
  finalUrl: string;
}> {
  const response = await safeFetch(rawUrl);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_REMOTE_BYTES) throw new CorpusError("FETCH_FAILED", "The remote source exceeds the 15 MB limit.", 413);
  const contentType = response.headers.get("content-type")?.toLowerCase() || "";
  if (contentType.includes("application/pdf") || rawUrl.toLowerCase().endsWith(".pdf")) {
    return { sections: await extractPdf(bytes), contentType: "application/pdf", finalUrl: response.url || rawUrl };
  }
  if (!contentType.includes("text/html") && !contentType.includes("text/plain") && contentType) {
    throw new CorpusError("FETCH_FAILED", `Unsupported source content type: ${contentType}.`, 415);
  }
  const decoded = new TextDecoder().decode(bytes);
  const sections = contentType.includes("text/plain")
    ? [{ title: null, pageOrSection: null, text: decoded }]
    : sectionsFromHtml(decoded);
  if (!sections.some((section) => section.text.trim())) {
    throw new CorpusError("NO_TEXT_EXTRACTED", "No useful text could be extracted from the source URL.", 422);
  }
  return { sections, contentType: contentType || "text/html", finalUrl: response.url || rawUrl };
}

export async function extractPdf(data: Uint8Array): Promise<DocumentSection[]> {
  if (data.byteLength > MAX_PDF_BYTES) throw new CorpusError("PDF_PARSE_FAILED", "The PDF exceeds the 20 MB limit.", 413);
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    const sections = result.pages
      .map((page) => ({ title: `Page ${page.num}`, pageOrSection: `Page ${page.num}`, text: page.text }))
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
