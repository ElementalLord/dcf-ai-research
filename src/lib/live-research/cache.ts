import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ingestSections } from "@/lib/corpus/ingest";
import { extractRemoteBytes } from "@/lib/corpus/source-extract";
import { CorpusError } from "@/lib/corpus/errors";
import { hashText } from "@/lib/corpus/text";
import type { DocumentSection } from "@/lib/corpus/types";
import { canonicalResearchUrl, type SourceAccessRule } from "./source-policy";
import { fetchApprovedResource } from "./live-fetch";
import { isFreshCacheRecord } from "./cache-policy";

type CacheRow = {
  id: string;
  access_id: string;
  source_id: string | null;
  canonical_url: string;
  etag: string | null;
  last_modified: string | null;
  expires_at: string;
  hit_count: number;
  fetch_status: string;
  content_hash: string | null;
};

export type LivePageResult = {
  url: string;
  sourceId: string;
  cacheId: string;
  cacheHit: boolean;
  chunks: number;
};

async function findCache(url: string): Promise<CacheRow | null> {
  const canonical = canonicalResearchUrl(url);
  const { data, error } = await supabaseAdmin
    .from("live_research_cache")
    .select("id, access_id, source_id, canonical_url, etag, last_modified, expires_at, hit_count, fetch_status, content_hash")
    .eq("canonical_url", canonical)
    .maybeSingle();
  if (error) throw new CorpusError("DATABASE_FAILED", "The live research cache could not be read.", 500, { cause: error });
  return data as CacheRow | null;
}

async function tagCachedSource(sourceId: string, personalityId: string, parameterFieldIds: string[]): Promise<void> {
  const { data: chunks, error } = await supabaseAdmin.from("source_chunks").select("id").eq("source_id", sourceId).eq("is_active", true);
  if (error) throw error;
  const personalityRows = (chunks || []).map((chunk) => ({
    chunk_id: chunk.id,
    personality_id: personalityId,
    relationship: "subject",
    relevance_score: 1,
    tagging_method: "manual",
    confidence: 1,
  }));
  const fieldRows = (chunks || []).flatMap((chunk) => parameterFieldIds.map((fieldId) => ({
    chunk_id: chunk.id,
    parameter_field_id: fieldId,
    confidence: 0.85,
    tagging_method: "rule",
  })));
  if (personalityRows.length) {
    const { error: tagError } = await supabaseAdmin.from("chunk_personalities").upsert(personalityRows, { onConflict: "chunk_id,personality_id" });
    if (tagError) throw tagError;
  }
  if (fieldRows.length) {
    const { error: fieldError } = await supabaseAdmin.from("chunk_parameter_fields").upsert(fieldRows, { onConflict: "chunk_id,parameter_field_id" });
    if (fieldError) throw fieldError;
  }
}

async function resolveEvidenceSource(rule: SourceAccessRule, finalUrl: string, title: string, discoveryProvider?: string): Promise<string> {
  const canonical = canonicalResearchUrl(finalUrl);
  const variants = [canonical, canonical.endsWith("/") ? canonical.slice(0, -1) : `${canonical}/`];
  const { data: existingRows, error: findError } = await supabaseAdmin.from("sources").select("id, source_status").in("url", variants).limit(1);
  if (findError) throw findError;
  const existing = existingRows?.[0];
  if (existing) {
    if (rule.evidence_use_status === "approved" && existing.source_status !== "approved") {
      const { error } = await supabaseAdmin.from("sources").update({ source_status: "approved", approval_origin: rule.approval_origin || "imported_existing" }).eq("id", existing.id);
      if (error) throw error;
    }
    return existing.id;
  }
  const { data, error } = await supabaseAdmin
    .from("sources")
    .insert({
      title: title || rule.display_name,
      author: null,
      source_type: rule.default_source_type || "approved_live_web",
      url: canonical,
      citation: canonical,
      source_status: rule.evidence_use_status === "approved" ? "approved" : "candidate",
      approval_origin: rule.approval_origin || "imported_existing",
      ingestion_status: "not_ingested",
      textual_layer: rule.default_textual_layer,
      metadata: { origin: "live_cache", accessId: rule.id, approvalSource: "approved_source_access", discoveryProvider: discoveryProvider || null },
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

function cacheMetadata(cacheId: string, retrievedAt: string, expiresAt: string, canonicalUrl: string) {
  return { origin: "live_cache", cacheId, retrievedAt, cacheExpiresAt: expiresAt, canonicalUrl };
}

export async function fetchAndCacheApprovedPage(args: {
  url: string;
  rules: SourceAccessRule[];
  personalityId: string;
  parameterFieldIds: string[];
  discoveryProvider?: string;
  now?: Date;
}): Promise<LivePageResult> {
  const now = args.now || new Date();
  const existing = await findCache(args.url);
  const activeRule = existing ? args.rules.find((rule) => rule.id === existing.access_id && rule.is_active && rule.evidence_use_status === "approved") : null;
  if (existing && activeRule && isFreshCacheRecord(existing, now) && existing.source_id) {
    await Promise.all([
      supabaseAdmin.from("live_research_cache").update({ hit_count: existing.hit_count + 1, last_accessed_at: now.toISOString() }).eq("id", existing.id),
      tagCachedSource(existing.source_id, args.personalityId, args.parameterFieldIds),
    ]);
    return { url: existing.canonical_url, sourceId: existing.source_id, cacheId: existing.id, cacheHit: true, chunks: 0 };
  }

  const fetched = await fetchApprovedResource(args.url, {
    rules: args.rules,
    requireEvidenceApproval: true,
    etag: existing?.etag,
    lastModified: existing?.last_modified,
  });
  const expiresAt = new Date(now.getTime() + fetched.access.cache_ttl_hours * 3_600_000).toISOString();
  if (fetched.status === 304 && existing?.source_id) {
    const { error } = await supabaseAdmin.from("live_research_cache").update({
      retrieved_at: now.toISOString(), expires_at: expiresAt, last_accessed_at: now.toISOString(),
      hit_count: existing.hit_count + 1, fetch_status: "ready", fetch_error: null,
    }).eq("id", existing.id);
    if (error) throw error;
    await tagCachedSource(existing.source_id, args.personalityId, args.parameterFieldIds);
    return { url: existing.canonical_url, sourceId: existing.source_id, cacheId: existing.id, cacheHit: true, chunks: 0 };
  }
  if (!fetched.bytes) throw new CorpusError("NO_TEXT_EXTRACTED", "The approved source returned no content.", 422);

  const sections = await extractRemoteBytes(fetched.bytes, fetched.contentType, fetched.finalUrl);
  const extractedText = sections.map((section) => section.text).join("\n\n");
  const title = sections.find((section) => section.title)?.title || fetched.access.display_name;
  const contentHash = hashText(extractedText);
  const { data: matching } = await supabaseAdmin.from("live_research_cache").select("source_id,canonical_url")
    .eq("content_hash", contentHash).eq("fetch_status", "ready").not("source_id", "is", null).limit(1);
  const duplicate = matching?.[0] && matching[0].canonical_url !== canonicalResearchUrl(fetched.finalUrl) ? matching[0] : null;
  const unchanged = existing?.source_id && existing.content_hash === contentHash;
  const sourceId = duplicate?.source_id || (unchanged ? existing.source_id : await resolveEvidenceSource(fetched.access, fetched.finalUrl, title || fetched.access.display_name, args.discoveryProvider));
  const canonicalUrl = canonicalResearchUrl(fetched.finalUrl);
  const { data: cache, error: cacheError } = await supabaseAdmin.from("live_research_cache").upsert({
    access_id: fetched.access.id,
    source_id: sourceId,
    requested_url: canonicalResearchUrl(args.url),
    final_url: canonicalUrl,
    canonical_url: canonicalUrl,
    title,
    etag: fetched.etag,
    last_modified: fetched.lastModified,
    content_hash: contentHash,
    retrieved_at: now.toISOString(),
    expires_at: expiresAt,
    last_accessed_at: now.toISOString(),
    hit_count: existing?.hit_count || 0,
    http_status: fetched.status,
    content_type: fetched.contentType,
    extracted_text: extractedText,
    fetch_status: "ready",
    fetch_error: null,
    metadata: { accessDisplayName: fetched.access.display_name, discoveryProvider: args.discoveryProvider || null, duplicateOf: duplicate?.canonical_url || null },
  }, { onConflict: "canonical_url" }).select("id").single();
  if (cacheError) throw new CorpusError("DATABASE_FAILED", "The approved page could not be cached.", 500, { cause: cacheError });

  if (duplicate || unchanged) {
    await tagCachedSource(sourceId, args.personalityId, args.parameterFieldIds);
    return { url: duplicate?.canonical_url || canonicalUrl, sourceId, cacheId: cache.id, cacheHit: true, chunks: 0 };
  }

  const decorated: DocumentSection[] = sections.map((section) => ({
    ...section,
    metadata: { ...(section.metadata || {}), ...cacheMetadata(cache.id, now.toISOString(), expiresAt, canonicalUrl) },
  }));
  const ingestion = await ingestSections({
    sourceId,
    personalityIds: [args.personalityId],
    parameterFieldIds: args.parameterFieldIds,
    textualLayer: fetched.access.default_textual_layer,
    language: "English",
    sections: decorated,
  });
  // Live research indexes passages lexically immediately. Optional embedding enrichment
  // is an explicit corpus action, so a fetch never consumes interactive AI quota.
  return { url: canonicalUrl, sourceId, cacheId: cache.id, cacheHit: false, chunks: ingestion.chunksCreated };
}
