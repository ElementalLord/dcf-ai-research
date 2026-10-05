import "server-only";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { CorpusError } from "@/lib/corpus/errors";
import { assertSafePublicUrl } from "@/lib/corpus/security";
import { selectSourceAuthorization, type SourceAccessRule } from "@/lib/live-research/source-policy";
import { djvuXmlPages, printedPageMap, type DocumentPage } from "./document-pages";
import { printedPageLabels } from "@/lib/corpus/source-extract";

/**
 * Corpus-administration document path. Ask never calls this: it downloads verified documents far
 * larger than the 12 MB live-fetch limit, once, into a local cache, and extracts pages locally.
 */
const MAX_DOCUMENT_BYTES = 200 * 1024 * 1024;
const USER_AGENT = "DCF-AI-Research/1.0 (+citation-first-corpus-completion)";

export type CachedDocument = { url: string; finalUrl: string; cachePath: string; sha256: string; sha1: string; bytes: number; contentType: string };

function cacheDirectory(): string {
  return process.env.CORPUS_DOCUMENT_CACHE_DIR || path.join(process.cwd(), ".corpus-cache", "documents");
}

function sameSite(host: string, authorized: string): boolean {
  const base = authorized.split(".").slice(-2).join(".");
  return host === authorized || host === base || host.endsWith(`.${base}`);
}

/** Downloads one approved document (ingest capability required) with a byte cap and same-site redirects only. */
export async function fetchCorpusDocument(url: string, rules: SourceAccessRule[], options: { timeoutMs?: number; maxBytes?: number } = {}): Promise<CachedDocument> {
  const rule = selectSourceAuthorization(url, rules, "ingest");
  if (!rule) throw new CorpusError("SOURCE_NOT_APPROVED", "The document is outside the approved source registry.", 403);
  // Authorization comes first: a cached copy never outlives the rule that permitted it.
  const cached = await supabaseAdmin.from("corpus_documents").select("url,final_url,cache_path,sha256,sha1,byte_size,content_type,status")
    .eq("url", url).maybeSingle();
  if (cached.data?.status === "ready" && cached.data.cache_path) {
    const exists = await stat(cached.data.cache_path).then((info) => info.size === Number(cached.data!.byte_size)).catch(() => false);
    if (exists) return { url, finalUrl: cached.data.final_url || url, cachePath: cached.data.cache_path, sha256: cached.data.sha256!,
      sha1: cached.data.sha1!, bytes: Number(cached.data.byte_size), contentType: cached.data.content_type || "" };
  }
  const authorizedHost = new URL(url).hostname;
  const maxBytes = options.maxBytes ?? MAX_DOCUMENT_BYTES;
  let current = url;
  try {
    for (let hop = 0; hop <= 5; hop++) {
      const safe = await assertSafePublicUrl(current);
      if (safe.protocol !== "https:" || !sameSite(safe.hostname, authorizedHost))
        throw new CorpusError("REDIRECT_NOT_APPROVED", "The document redirected off its approved site.", 403);
      const response = await fetch(safe, { redirect: "manual", signal: AbortSignal.timeout(options.timeoutMs ?? 300_000),
        headers: { "User-Agent": USER_AGENT, Accept: "application/pdf,application/xml,text/xml,application/json,text/plain,*/*;q=0.5" } });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new CorpusError("FETCH_FAILED", "Redirect without destination.", 502);
        current = new URL(location, safe).toString();
        continue;
      }
      if (!response.ok || !response.body) throw new CorpusError("FETCH_FAILED", `The document returned HTTP ${response.status}.`, 502);
      if (Number(response.headers.get("content-length") || 0) > maxBytes) throw new CorpusError("CONTENT_TOO_LARGE", "The document exceeds the corpus document limit.", 413);
      await mkdir(cacheDirectory(), { recursive: true });
      const name = createHash("sha256").update(url).digest("hex").slice(0, 32);
      const target = path.join(cacheDirectory(), name);
      const partial = `${target}.partial`;
      const sha256 = createHash("sha256");
      const sha1 = createHash("sha1");
      const output = createWriteStream(partial);
      let total = 0;
      try {
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > maxBytes) { await reader.cancel(); throw new CorpusError("CONTENT_TOO_LARGE", "The document exceeds the corpus document limit.", 413); }
          sha256.update(value); sha1.update(value);
          if (!output.write(value)) await new Promise<void>((resolve) => output.once("drain", () => resolve()));
        }
        await new Promise<void>((resolve, reject) => output.end((error?: Error | null) => error ? reject(error) : resolve()));
        await rename(partial, target);
      } catch (error) {
        output.destroy();
        await unlink(partial).catch(() => undefined);
        throw error;
      }
      const document = { url, finalUrl: safe.toString(), cachePath: target, sha256: sha256.digest("hex"), sha1: sha1.digest("hex"),
        bytes: total, contentType: (response.headers.get("content-type") || "").toLowerCase() };
      await supabaseAdmin.from("corpus_documents").upsert({ url, final_url: document.finalUrl, sha256: document.sha256, sha1: document.sha1,
        byte_size: total, content_type: document.contentType, cache_path: target, status: "ready", error: null,
        fetched_at: new Date().toISOString() }, { onConflict: "url" });
      return document;
    }
    throw new CorpusError("FETCH_FAILED", "The document redirected too many times.", 502);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabaseAdmin.from("corpus_documents").upsert({ url, status: "failed", error: message.slice(0, 500), fetched_at: new Date().toISOString() }, { onConflict: "url" });
    throw error;
  }
}

/** Page texts of a cached PDF, with printed page labels when the running heads are consistent. */
export async function pdfPages(document: CachedDocument): Promise<{ pages: DocumentPage[]; textLayer: boolean; pageCount: number }> {
  const parser = new PDFParse({ data: new Uint8Array(await readFile(document.cachePath)) });
  try {
    const info = await parser.getInfo();
    const pageCount = info.total;
    // A sample decides whether the PDF has a text layer before extracting hundreds of pages.
    const sample = [...new Set([1, 2, 3, 5, 10, 20, 40, 80].map((page) => Math.min(page, pageCount)))];
    const probe = await parser.getText({ partial: sample });
    const textLayer = probe.pages.reduce((sum, page) => sum + page.text.trim().length, 0) >= 200;
    await supabaseAdmin.from("corpus_documents").update({ page_count: pageCount, text_layer: textLayer ? "present" : "absent" }).eq("url", document.url);
    if (!textLayer) return { pages: [], textLayer, pageCount };
    const result = await parser.getText();
    const labels = printedPageLabels(result.pages);
    return { pages: result.pages.map((page) => ({ index: page.num, printed: labels.get(page.num)?.match(/^p\. (\d+)/)?.[1] || null, text: page.text })),
      textLayer, pageCount };
  } finally {
    await parser.destroy();
  }
}

export type ArchiveFile = { name: string; sha1?: string; size?: string; format?: string };
export type ArchiveRecord = { identifier: string; metadata: Record<string, unknown>; files: ArchiveFile[] };

async function readJson(url: string, limit = 2 * 1024 * 1024): Promise<Record<string, unknown> | null> {
  const safe = await assertSafePublicUrl(url);
  const response = await fetch(safe, { redirect: "error", signal: AbortSignal.timeout(20_000), headers: { Accept: "application/json", "User-Agent": USER_AGENT } });
  if (!response.ok) return null;
  const body = await response.text();
  if (body.length > limit) throw new CorpusError("CONTENT_TOO_LARGE", "Repository record is too large.", 413);
  return JSON.parse(body) as Record<string, unknown>;
}

export async function archiveRecord(identifier: string): Promise<ArchiveRecord | null> {
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(identifier)) return null;
  const record = await readJson(`https://archive.org/metadata/${identifier}`);
  if (!record?.metadata) return null;
  return { identifier, metadata: record.metadata as Record<string, unknown>, files: (record.files || []) as ArchiveFile[] };
}

/** Reversed-hostname mirror identifier ("ignca.gov.in" + "24136" → "in.gov.ignca.24136"), the repository's naming for mirrored collections. */
export function mirrorIdentifier(originalUrl: string, fileStem: string | null): string | null {
  if (!fileStem || !/^[A-Za-z0-9_-]{2,80}$/.test(fileStem)) return null;
  const host = new URL(originalUrl).hostname.replace(/^www\./, "");
  return `${host.split(".").reverse().join(".")}.${fileStem}`;
}

/**
 * The repository's own catalogue, never a web search: the mirror identifier first, then items whose
 * identifier ends with the cited file's stem and whose title names the work, then the work title alone.
 * Every candidate is identity-checked (checksum or catalogue file name) before use.
 */
export async function archiveCatalogueCandidates(originalUrl: string, fileStem: string | null, workTitle: string): Promise<string[]> {
  const terms = workTitle.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9 ]+/g, " ").trim();
  const mirror = mirrorIdentifier(originalUrl, fileStem);
  const stemOk = fileStem && /^[A-Za-z0-9_-]{2,60}$/.test(fileStem);
  const queries = [stemOk && terms.length >= 6 ? `identifier:*${fileStem} AND title:(${terms})` : null,
    terms.length >= 6 ? `title:(${terms}) AND mediatype:texts` : null].filter(Boolean) as string[];
  const out: string[] = mirror ? [mirror] : [];
  for (const query of queries) {
    const record = await readJson(`https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}&fl[]=identifier&rows=15&output=json`).catch(() => null);
    const docs = ((record?.response as { docs?: Array<{ identifier: string }> } | undefined)?.docs || []);
    for (const doc of docs) if (!out.includes(doc.identifier)) out.push(doc.identifier);
  }
  return out.slice(0, 20);
}

/** OCR'd scan pages from the repository's DjVu XML and page-number map (both under the item's approved download path). */
export async function archiveScanPages(record: ArchiveRecord, rules: SourceAccessRule[], stem: string): Promise<DocumentPage[]> {
  const base = `https://archive.org/download/${record.identifier}`;
  const document = await fetchCorpusDocument(`${base}/${stem}_djvu.xml`, rules, { maxBytes: 80 * 1024 * 1024 });
  const numbersFile = record.files.find((file) => file.name === `${stem}_page_numbers.json`);
  const numbers = numbersFile ? await fetchCorpusDocument(`${base}/${numbersFile.name}`, rules, { maxBytes: 8 * 1024 * 1024 })
    .then(async (file) => JSON.parse(await readFile(file.cachePath, "utf8")) as { confidence?: number; pages?: Array<{ leafNum: number; pageNumber: string }> })
    .catch(() => null) : null;
  return djvuXmlPages(await readFile(document.cachePath, "utf8"), printedPageMap(numbers));
}
