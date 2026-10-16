import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import { PDFParse } from "pdf-parse";
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const output = process.argv.find((arg) => arg.startsWith("--output="))?.slice(9) || ".corpus-cache/resource-source-audit-2026-10-10.json";
const norm = (value) => String(value || "").normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function allRows(table, columns) {
  const result = [];
  for (let from = 0;; from += 500) {
    const page = await db.from(table).select(columns).range(from, from + 499);
    if (page.error) throw page.error;
    result.push(...page.data);
    if (page.data.length < 500) return result;
  }
}

async function documentText(response, url) {
  const bytes = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "";
  const isPdf = /application\/pdf/i.test(contentType) || /\.pdf(?:$|[?#])/i.test(url);
  if (bytes.length > 28_000_000) return { text: "", bytes: bytes.length, contentType, issue: "too_large_to_extract" };
  if (isPdf || bytes.subarray(0, 4).toString() === "%PDF") {
    const parser = new PDFParse({ data: bytes });
    try { return { text: (await parser.getText()).text.replace(/\s+/g, " ").trim(), bytes: bytes.length, contentType, issue: null }; }
    finally { await parser.destroy(); }
  }
  const $ = cheerio.load(bytes.toString("utf8"));
  $("script,style,nav,footer,header,aside").remove();
  const text = [$("main").first().text(), $("article").first().text(), $("body").text()]
    .map((candidate) => candidate.replace(/\s+/g, " ").trim()).find(Boolean) || "";
  return { text, bytes: bytes.length, contentType, issue: null };
}

function excerptResult(excerpt, fullText) {
  const evidence = norm(excerpt);
  const page = norm(fullText);
  if (!evidence || !page) return "unverified";
  if (page.includes(evidence)) return "full";
  const words = evidence.split(" ");
  const windows = [20, 12, 7];
  for (const count of windows) {
    if (words.length < count) continue;
    for (let start = 0; start <= words.length - count; start += Math.max(1, Math.floor(count / 2))) {
      if (page.includes(words.slice(start, start + count).join(" "))) return `partial_${count}_words`;
    }
  }
  return "missing";
}

async function scan(source, evidence, chunks) {
  const result = { id: source.id, title: source.title, url: source.url, people: source.people,
    sourceStatus: source.source_status, approvalOrigin: source.approval_origin, evidenceCount: evidence.length,
    chunkCount: chunks.length, httpStatus: null, finalUrl: null, contentType: null, bytes: 0, textLength: 0,
    access: null, excerptChecks: [], issue: null };
  if (!source.url) { result.access = "no_url"; result.issue = "no_original_link"; return result; }
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(source.url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; DCF source audit; research provenance check)", Accept: "text/html,application/pdf,*/*" }, signal: AbortSignal.timeout(20000) });
      result.httpStatus = response.status;
      result.finalUrl = response.url;
      if ([429, 502, 503, 504].includes(response.status) && attempt === 0) { await delay(700); continue; }
      if (!response.ok) { result.access = "http_error"; result.issue = `http_${response.status}`; return result; }
      const document = await documentText(response, source.url);
      result.contentType = document.contentType;
      result.bytes = document.bytes;
      result.textLength = document.text.length;
      if (document.issue) { result.access = "unverified"; result.issue = document.issue; return result; }
      const lower = document.text.toLowerCase();
      if (/enable javascript and cookies to continue|a required part of this site couldn.t load|access denied|just a moment|captcha|verify you are human/i.test(lower.slice(0, 600))) {
        result.access = "challenge"; result.issue = "browser_or_login_required"; return result;
      }
      if (document.text.length < 300) { result.access = "thin_page"; result.issue = "little_readable_text"; return result; }
      result.access = "readable";
      const samples = evidence.length ? evidence.map((row) => ({ kind: "claim", id: row.id, excerpt: row.evidence_excerpt }))
        : chunks.slice(0, 3).map((row) => ({ kind: "chunk", id: row.id, excerpt: row.chunk_text }));
      result.excerptChecks = samples.map((row) => ({ kind: row.kind, id: row.id, match: excerptResult(row.excerpt, document.text), length: row.excerpt?.length || 0 }));
      if (!samples.length) result.issue = "no_attached_passage";
      else if (result.excerptChecks.every((row) => row.match === "missing" || row.match === "unverified")) result.issue = "no_sample_passage_found";
      return result;
    } catch (error) {
      lastError = error;
      if (attempt === 0) await delay(500);
    }
  }
  result.access = "fetch_error";
  result.issue = lastError?.cause?.code || lastError?.name || String(lastError);
  return result;
}

async function main() {
  const [people, links, sources, claims, evidence, chunks] = await Promise.all([
    allRows("personalities", "id,canonical_name"),
    allRows("source_personalities", "source_id,personality_id"),
    allRows("sources", "id,title,url,source_status,approval_origin,citation,publisher_or_institution"),
    allRows("claims", "id,review_status"),
    allRows("claim_sources", "id,source_id,claim_id,evidence_excerpt,page_or_section"),
    allRows("source_chunks", "id,source_id,chunk_text,page_or_section,is_active"),
  ]);
  const personById = new Map(people.map((person) => [person.id, person.canonical_name]));
  const peopleBySource = new Map();
  for (const link of links) peopleBySource.set(link.source_id, [...(peopleBySource.get(link.source_id) || []), personById.get(link.personality_id)]);
  const visibleIds = new Set(links.map((link) => link.source_id));
  const bySource = (records) => {
    const map = new Map();
    for (const record of records) map.set(record.source_id, [...(map.get(record.source_id) || []), record]);
    return map;
  };
  const currentClaimIds = new Set(claims.filter((claim) => claim.review_status !== "rejected").map((claim) => claim.id));
  const evidenceBySource = bySource(evidence.filter((row) => currentClaimIds.has(row.claim_id)));
  const chunksBySource = bySource(chunks.filter((chunk) => chunk.is_active !== false));
  const visible = sources.filter((source) => visibleIds.has(source.id)).map((source) => ({ ...source, people: peopleBySource.get(source.id) || [] }));
  // Interleave hosts so the scan does not burst-request one archive.
  const buckets = new Map();
  for (const source of visible) {
    let host; try { host = new URL(source.url).hostname; } catch { host = "no-url"; }
    buckets.set(host, [...(buckets.get(host) || []), source]);
  }
  const queue = [];
  while ([...buckets.values()].some((bucket) => bucket.length)) for (const bucket of buckets.values()) if (bucket.length) queue.push(bucket.shift());
  const results = [];
  let cursor = 0;
  async function worker() {
    while (cursor < queue.length) {
      const source = queue[cursor++];
      const result = await scan(source, evidenceBySource.get(source.id) || [], chunksBySource.get(source.id) || []);
      results.push(result);
      if (results.length % 20 === 0 || results.length === queue.length) console.log(`Scanned ${results.length}/${queue.length}`);
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  results.sort((a, b) => a.title.localeCompare(b.title));
  const summary = { scanned: results.length, access: {}, issues: {}, samplePassages: { matched: 0, missing: 0, unverified: 0 } };
  for (const row of results) {
    summary.access[row.access] = (summary.access[row.access] || 0) + 1;
    if (row.issue) summary.issues[row.issue] = (summary.issues[row.issue] || 0) + 1;
    for (const check of row.excerptChecks) summary.samplePassages[check.match?.startsWith("partial") || check.match === "full" ? "matched" : check.match === "missing" ? "missing" : "unverified"]++;
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify({ generatedAt: new Date().toISOString(), summary, sources: results }, null, 2));
  console.log(JSON.stringify({ output, summary }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
