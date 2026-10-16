import fs from "node:fs";
import crypto from "node:crypto";
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";

const apply = process.argv.includes("--apply");
const seed = JSON.parse(fs.readFileSync(new URL("../data/vasistha-candidate-claims.json", import.meta.url), "utf8"));
const personalityName = "Vasistha";
const sourceById = new Map(seed.sources.map((source) => [source.id, source]));
const normalize = (value) => value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fieldsByParameter = {
  "Textual Contribution": "mantras_suktas",
  "Historical / Textual Context": "textual_layers",
  "Relational / Social Role": "royal_advisory",
  "Parampara / Lineage": "gotra",
  Philosophy: "core_teaching",
  "Role / Vocation": "primary_function",
  "Contested / Uncertain": "myth_history",
  "Contemporary Relevance": "modern_practice",
  "Inner Qualities": "virtues",
  "Tapas / Sadhana": "spiritual_practice",
};
const kindsByEpistemicType = {
  textual_assertion: "textual_tradition",
  traditional_narrative: "traditional_account",
  scholarly_attribution: "scholarly_interpretation",
  synthesis_across_sources: "scholarly_interpretation",
  methodological: "uncertain",
  modern_reception: "contemporary_relevance",
  scholarly_interpretation: "scholarly_interpretation",
  historical_inference: "uncertain",
};

function textualLayer(source) {
  if (["S01", "S02"].includes(source.id)) return "Rigveda — Mandala 7";
  if (/Ramayana/.test(source.title)) return "Valmiki Ramayana";
  if (["S19", "S20", "S21"].includes(source.id)) return "Modern Vedic scholarship";
  if (["S22", "S23"].includes(source.id)) return "Later Yogavasistha reception";
  if (source.id === "S24") return "Dharmasutra tradition";
  return "Later Sakta reception";
}

function sourceType(source) {
  if (/primary/.test(source.type)) return "primary_text";
  if (/publisher description/.test(source.type)) return "scholarly_book";
  if (/scholarly|academic/.test(source.type)) return "scholarly_article";
  return "institutional";
}

async function rows(query) {
  const output = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await query.range(offset, offset + 999);
    if (result.error) throw result.error;
    output.push(...(result.data || []));
    if ((result.data || []).length < 1000) return output;
  }
}

async function fetchPage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "user-agent": "Mozilla/5.0 (DCF source review)" } });
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) return null;
    const html = await response.text();
    if (html.length < 1000 || html.length > 3_000_000) return null;
    const $ = cheerio.load(html);
    $("script, style, nav, footer, header, form, iframe").remove();
    const main = $("main").first().length ? $("main").first() : $("article").first().length ? $("article").first() : $("body");
    main.find("br").replaceWith("\n");
    main.find("p, h1, h2, h3, h4, li, tr").each((_, element) => $(element).prepend("\n"));
    const text = main.text().replace(/\r/g, "").replace(/[\t ]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
    if (text.length < 200 || /access denied|enable javascript to continue/i.test(text.slice(0, 1000))) return null;
    return { url: response.url, text, $ };
  } finally {
    clearTimeout(timeout);
  }
}

function sourceVariants(source) {
  const urls = [source.url];
  if (source.url.includes("sanskritdocuments.org/sites/valmikiramayan/")) {
    urls.push(source.url.replace(/^https?:\/\/(?:www\.)?sanskritdocuments\.org\/sites\/valmikiramayan\//, "https://www.valmikiramayan.net/"));
  }
  return urls;
}

function splitText(text, size = 3800) {
  const lines = text.split("\n");
  const chunks = [];
  let current = "";
  for (const line of lines) {
    if (current && current.length + line.length > size) {
      chunks.push(current.trim());
      current = "";
    }
    if (line.length > size) {
      for (let offset = 0; offset < line.length; offset += size) chunks.push(line.slice(offset, offset + size));
    } else current += `${line}\n`;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter((chunk) => chunk.length > 80);
}

function rigvedaHymn(claim) {
  return Number(claim.locator.match(/(?:RV|Rigveda)\s*7\.(\d+)/i)?.[1] || 0);
}

function overlapScore(claim, chunk) {
  const verse = claim.locator.match(/RV\s*7\.(\d+)\.(\d+)/i);
  if (verse && chunk.chunk_text.includes(`7.${String(Number(verse[1])).padStart(3, "0")}.${String(Number(verse[2])).padStart(2, "0")}`)) return 1000;
  if (verse && chunk.chunk_text.includes(`7.${String(Number(verse[1])).padStart(3, "0")}.`)) return 100;
  const words = [...new Set(normalize(claim.claim).split(" ").filter((word) => word.length > 4))];
  const haystack = normalize(chunk.chunk_text);
  return words.reduce((score, word) => score + (haystack.includes(word) ? 1 : 0), 0);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase credentials are required in the environment.");
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: person, error: personError } = await db.from("personalities").select("id").eq("canonical_name", personalityName).single();
  if (personError) throw personError;
  const fieldRows = await rows(db.from("parameter_fields").select("id,code,parameters!inner(categories!inner(slug))").eq("parameters.categories.slug", "rishi"));
  const fields = new Map(fieldRows.map((field) => [field.code, field.id]));
  const priorClaims = await rows(db.from("claims").select("claim_text").eq("personality_id", person.id));
  const priorCandidates = await rows(db.from("candidate_claims").select("claim_text").eq("personality_id", person.id));
  const known = new Set([...priorClaims, ...priorCandidates].map((row) => normalize(row.claim_text)));
  const existingSources = await rows(db.from("sources").select("id,url,title,source_status"));
  const sourcesByUrl = new Map(existingSources.filter((source) => source.url).map((source) => [source.url, source]));
  const summary = { proposed: seed.claims.length, inserted: 0, duplicates: 0, unavailable: [], sourcePages: 0, chunksCreated: 0 };
  const portalPage = await fetchPage(sourceById.get("S01").url);
  const portalLinks = new Map();
  if (portalPage) for (const element of portalPage.$("a").toArray()) {
    const label = portalPage.$(element).text().trim();
    if (/^\d{3}$/.test(label)) portalLinks.set(Number(label), new URL(portalPage.$(element).attr("href"), portalPage.url).href);
  }

  const groups = new Map();
  for (const claim of seed.claims) {
    const source = sourceById.get(claim.source);
    if (!source) throw new Error(`Unknown source ${claim.source}`);
    const hymn = source.id === "S01" ? rigvedaHymn(claim) : 0;
    const key = `${source.id}:${hymn || "all"}`;
    if (!groups.has(key)) groups.set(key, { source, hymn, claims: [] });
    groups.get(key).claims.push(claim);
  }

  for (const group of groups.values()) {
    const { source, hymn, claims } = group;
    if (source.id === "S01" && !hymn) {
      summary.unavailable.push({ source: source.id, reason: "No hymn locator on a single-hymn page", claims: claims.map((claim) => claim.id) });
      continue;
    }
    const urls = hymn && portalLinks.has(hymn) ? [portalLinks.get(hymn)] : sourceVariants(source);
    let page = null;
    for (const candidateUrl of urls) {
      try { page = await fetchPage(candidateUrl); } catch { /* Report unreachable sources below. */ }
      if (page) break;
    }
    if (!page) {
      summary.unavailable.push({ source: source.id, hymn: hymn || null, claims: claims.map((claim) => claim.id) });
      continue;
    }
    summary.sourcePages++;
    let sourceRow = sourcesByUrl.get(page.url) || sourcesByUrl.get(urls[0]);
    if (!sourceRow && apply) {
      const created = await db.from("sources").insert({
        title: hymn ? `${source.title} — Sukta ${String(hymn).padStart(3, "0")}` : source.title,
        publisher_or_institution: source.publisher,
        source_type: sourceType(source),
        url: page.url,
        citation: `${source.title}. ${page.url}`,
        source_status: "candidate",
        ingestion_status: "ready",
        textual_layer: textualLayer(source),
        rights_or_access_note: "Public HTML page; use subject to source review.",
        metadata: { vasistha_seed_source_id: source.id, user_supplied_seed: true },
      }).select("id,url,title,source_status").single();
      if (created.error) throw created.error;
      sourceRow = created.data;
      sourcesByUrl.set(page.url, sourceRow);
    }
    if (sourceRow && apply) {
      const linked = await db.from("source_personalities").upsert({
        source_id: sourceRow.id,
        personality_id: person.id,
        relationship: "relevant",
        mapping_method: "claim_link",
        metadata: { vasistha_seed_source_id: source.id },
      }, { onConflict: "source_id,personality_id", ignoreDuplicates: true });
      if (linked.error) throw linked.error;
    }
    let chunks = sourceRow ? await rows(db.from("source_chunks").select("id,chunk_text,page_or_section").eq("source_id", sourceRow.id).eq("is_active", true)) : [];
    if (!chunks.length && !apply) chunks = splitText(page.text).map((chunk_text, index) => ({ id: `dry-run-${index}`, chunk_text }));
    if (!chunks.length && apply && sourceRow) {
      const parts = splitText(page.text);
      for (let index = 0; index < parts.length; index++) {
        const chunk = parts[index];
        const created = await db.from("source_chunks").upsert({
          source_id: sourceRow.id,
          chunk_index: index,
          chunk_text: chunk,
          page_or_section: hymn ? `RV 7.${hymn}` : source.title,
          textual_layer: textualLayer(source),
          content_hash: hash(chunk),
          token_estimate: Math.ceil(chunk.length / 4),
          metadata: { vasistha_seed_source_id: source.id, fetched_original_url: page.url },
        }, { onConflict: "source_id,content_hash" }).select("id,chunk_text,page_or_section").single();
        if (created.error) throw created.error;
        chunks.push(created.data);
        summary.chunksCreated++;
      }
    }
    for (const claim of claims) {
      const normalized = normalize(claim.claim);
      if (known.has(normalized)) { summary.duplicates++; continue; }
      const code = fieldsByParameter[claim.primary_parameter];
      if (!fields.has(code)) throw new Error(`Missing field for ${claim.primary_parameter}`);
      const selected = [...chunks].sort((a, b) => overlapScore(claim, b) - overlapScore(claim, a))[0];
      if (!selected) continue;
      if (apply) {
        const result = await db.from("candidate_claims").insert({
          personality_id: person.id,
          parameter_field_id: fields.get(code),
          source_chunk_id: selected.id,
          claim_text: claim.claim,
          claim_kind: kindsByEpistemicType[claim.epistemic_type] || "uncertain",
          certainty: claim.certainty,
          status: "pending",
          extraction_note: `${claim.id}; user-supplied candidate; ${claim.epistemic_type}; seed source ${source.id}; locator ${claim.locator}. Passage association and claim need human verification.`,
        });
        if (result.error) throw result.error;
      }
      known.add(normalized);
      summary.inserted++;
    }
    console.log(`${source.id}${hymn ? ` RV 7.${hymn}` : ""}: ${claims.length} proposals, ${chunks.length} source chunks`);
    await sleep(100);
  }
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", ...summary }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
