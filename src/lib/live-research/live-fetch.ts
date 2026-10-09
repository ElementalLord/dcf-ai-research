import "server-only";
import { CorpusError } from "@/lib/corpus/errors";
import { assertSafePublicUrl } from "@/lib/corpus/security";
import {
  assertRedirectApproved,
  assertUrlApprovedForResearch,
  canonicalResearchUrl,
  type SourceCapability,
  type SourceAccessRule,
} from "./source-policy";
import type { ArchiveItemRecord } from "./verification";

const MAX_LIVE_BYTES = 12 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const ALLOWED_TYPES = ["text/html", "text/plain", "application/xhtml+xml", "application/pdf", "application/xml", "text/xml"];

export type ApprovedFetchResult = {
  access: SourceAccessRule;
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType: string;
  etag: string | null;
  lastModified: string | null;
  bytes: Uint8Array | null;
};

type FetchOptions = {
  rules: SourceAccessRule[];
  requireEvidenceApproval?: boolean;
  etag?: string | null;
  lastModified?: string | null;
  acceptXml?: boolean;
  fetchImpl?: typeof fetch;
  networkValidator?: (url: string) => Promise<URL>;
  capability?: SourceCapability;
  urlAllowed?: (url: string) => boolean;
};

async function readBounded(response: Response): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_LIVE_BYTES) throw new CorpusError("CONTENT_TOO_LARGE", "The approved source exceeds the 12 MB live-fetch limit.", 413);
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_LIVE_BYTES) {
      await reader.cancel();
      throw new CorpusError("CONTENT_TOO_LARGE", "The approved source exceeded the 12 MB live-fetch limit.", 413);
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

export async function fetchApprovedResource(rawUrl: string, options: FetchOptions): Promise<ApprovedFetchResult> {
  const fetchImpl = options.fetchImpl || fetch;
  const validateNetwork = options.networkValidator || assertSafePublicUrl;
  const requestedUrl = rawUrl;
  let current = rawUrl;
  const capability = options.capability || "fetch";
  let access = assertUrlApprovedForResearch(current, options.rules, capability, options.requireEvidenceApproval ?? true);

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    if (options.urlAllowed && !options.urlAllowed(current)) throw new CorpusError("SOURCE_NOT_APPROVED", "Search policy blocks this URL.", 403);
    const safeUrl = await validateNetwork(current);
    const headers = new Headers({
      Accept: options.acceptXml
        ? "application/xml,text/xml,text/html;q=0.8,text/plain;q=0.7"
        : "text/html,application/xhtml+xml,text/plain,application/pdf;q=0.9",
      "User-Agent": "DCF-AI-Research/1.0 (+controlled-approved-source-research)",
    });
    if (redirect === 0 && options.etag) headers.set("If-None-Match", options.etag);
    if (redirect === 0 && options.lastModified) headers.set("If-Modified-Since", options.lastModified);

    let response: Response;
    try {
      response = await fetchImpl(safeUrl, { redirect: "manual", headers, signal: AbortSignal.timeout(15_000) });
    } catch (error) {
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new CorpusError("FETCH_TIMEOUT", "The approved source timed out.", 504, { cause: error });
      }
      throw new CorpusError("FETCH_FAILED", "The approved source could not be fetched.", 502, { cause: error });
    }

    if (response.status >= 300 && response.status < 400) {
      if (redirect === MAX_REDIRECTS) throw new CorpusError("FETCH_FAILED", "The approved source redirected too many times.", 502);
      const location = response.headers.get("location");
      if (!location) throw new CorpusError("FETCH_FAILED", "The approved source redirected without a destination.", 502);
      current = new URL(location, safeUrl).toString();
      access = assertRedirectApproved(current, options.rules, capability, options.requireEvidenceApproval ?? true);
      continue;
    }

    if (response.status === 304) {
      return { access, requestedUrl, finalUrl: safeUrl.toString(), status: 304, contentType: response.headers.get("content-type") || "", etag: response.headers.get("etag"), lastModified: response.headers.get("last-modified"), bytes: null };
    }
    if (!response.ok) throw new CorpusError("FETCH_FAILED", `The approved source returned HTTP ${response.status}.`, 502);
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (contentType && !ALLOWED_TYPES.some((allowed) => contentType.includes(allowed))) {
      throw new CorpusError("UNSUPPORTED_CONTENT_TYPE", `The approved source returned ${contentType}.`, 415);
    }
    return {
      access,
      requestedUrl,
      finalUrl: safeUrl.toString(),
      status: response.status,
      contentType: contentType || "text/html",
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
      bytes: await readBounded(response),
    };
  }
  throw new CorpusError("FETCH_FAILED", "The approved source could not be fetched.", 502);
}

/** A bounded, non-evidence read. Every redirect gets the same DNS/SSRF check as ingestion. */
export async function fetchDiscoveryPreview(rawUrl: string, options: {
  fetchImpl?: typeof fetch;
  networkValidator?: (url: string) => Promise<URL>;
} = {}): Promise<{ finalUrl: string; status: number; contentType: string; html: string }> {
  const validate = options.networkValidator || assertSafePublicUrl;
  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    current = canonicalResearchUrl(current);
    const normalized = new URL(current);
    if (normalized.protocol !== "https:") throw new CorpusError("UNSAFE_URL", "Discovery verification requires HTTPS.", 403);
    const safe = await validate(current);
    if (safe.protocol !== "https:") throw new CorpusError("UNSAFE_URL", "Discovery verification requires HTTPS.", 403);
    const response = await (options.fetchImpl || fetch)(safe, {
      redirect: "manual", signal: AbortSignal.timeout(12_000),
      headers: { Accept: "text/html,application/xhtml+xml;q=0.9", "User-Agent": "DCF-AI-Research/1.0 (+candidate-verification)" },
    });
    if (response.status >= 300 && response.status < 400) {
      if (hop === MAX_REDIRECTS) throw new CorpusError("FETCH_FAILED", "Candidate redirected too many times.", 502);
      const location = response.headers.get("location");
      if (!location) throw new CorpusError("FETCH_FAILED", "Candidate redirect has no destination.", 502);
      current = new URL(location, safe).toString();
      continue;
    }
    if (!response.ok) return { finalUrl: safe.toString(), status: response.status, contentType: response.headers.get("content-type") || "", html: "" };
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (!/^(text\/html|application\/xhtml\+xml)(;|$)/.test(contentType)) {
      return { finalUrl: safe.toString(), status: response.status, contentType, html: "" };
    }
    const limit = 256 * 1024;
    const reader = response.body?.getReader();
    if (!reader) return { finalUrl: safe.toString(), status: response.status, contentType, html: "" };
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = limit - total;
      if (value.byteLength > remaining) {
        if (remaining > 0) chunks.push(value.subarray(0, remaining));
        total = limit;
        await reader.cancel();
        break;
      }
      total += value.byteLength;
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { finalUrl: safe.toString(), status: response.status, contentType, html: new TextDecoder().decode(bytes) };
  }
  throw new CorpusError("FETCH_FAILED", "Candidate verification failed.", 502);
}

async function readArchiveJson(url: string, fetchImpl: typeof fetch): Promise<Record<string, unknown> | null> {
  const safe = await assertSafePublicUrl(url);
  const response = await fetchImpl(safe, { redirect: "error", signal: AbortSignal.timeout(12_000),
    headers: { Accept: "application/json", "User-Agent": "DCF-AI-Research/1.0 (+candidate-verification)" } });
  if (!response.ok) return null;
  const body = await response.text();
  if (body.length > 512 * 1024) throw new CorpusError("CONTENT_TOO_LARGE", "Archive item record is too large.", 413);
  return JSON.parse(body) as Record<string, unknown>;
}

/** Reads an archive.org item's own metadata and counts personality mentions with search-inside. Non-evidence. */
export async function fetchArchiveItemRecord(identifier: string, aliases: string[], fetchImpl: typeof fetch = fetch): Promise<ArchiveItemRecord | null> {
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(identifier)) return null;
  const record = await readArchiveJson(`https://archive.org/metadata/${identifier}`, fetchImpl);
  const metadata = record?.metadata as Record<string, unknown> | undefined;
  if (!record || !metadata) return null;
  const first = (value: unknown) => (Array.isArray(value) ? value[0] : value) == null ? null : String(Array.isArray(value) ? value[0] : value).trim() || null;
  let nameMatches = 0;
  const server = String(record.server || "");
  const dir = String(record.dir || "");
  // The search-inside host comes from the item record, so it is pinned to archive.org storage nodes.
  if (/^ia\d+\.us\.archive\.org$/.test(server) && /^\/\d+\/items\/[A-Za-z0-9._-]+$/.test(dir)) {
    const terms = [...new Set(aliases.map((alias) => alias.normalize("NFKD").replace(/[̀-ͯ]/g, ""))
      .filter((alias) => /^[A-Za-z]{5,}$/.test(alias)))].slice(0, 3);
    for (const term of terms) {
      const inside = await readArchiveJson(`https://${server}/fulltext/inside.php?item_id=${identifier}&doc=${identifier}&path=${dir}&q=${encodeURIComponent(term)}`, fetchImpl).catch(() => null);
      nameMatches += Array.isArray(inside?.matches) ? inside.matches.length : 0;
      if (nameMatches) break;
    }
  }
  return { identifier, title: first(metadata.title), creator: first(metadata.creator), date: first(metadata.date),
    publisher: first(metadata.publisher), contributor: first(metadata.contributor), scanningCenter: first(metadata.scanningcenter),
    copyrightStatus: first(metadata["possible-copyright-status"]), licenseUrl: first(metadata.licenseurl),
    rights: first(metadata.rights), nameMatches };
}
