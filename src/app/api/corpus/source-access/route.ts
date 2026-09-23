import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { assertCorpusAdmin, assertRequestSize, corpusErrorResponse } from "@/lib/corpus/api";
import { CorpusError } from "@/lib/corpus/errors";
import { normalizeResearchUrl } from "@/lib/live-research/source-policy";

const scopeSchema = z.enum(["DOMAIN", "PATH_PREFIX", "EXACT_URL"]);
const baseSchema = z.object({
  displayName: z.string().trim().min(2).max(300),
  domain: z.string().trim().min(3).max(253),
  scopeType: scopeSchema,
  allowedPathPrefix: z.string().trim().max(1_000).nullable().optional(),
  exactUrl: z.string().trim().max(2_000).nullable().optional(),
  includeSubdomains: z.boolean().default(false),
  allowLiveSearch: z.boolean().default(false),
  allowLiveFetch: z.boolean().default(false),
  allowIngestion: z.boolean().default(false),
  evidenceUseStatus: z.enum(["candidate", "approved", "rejected"]).default("candidate"),
  priority: z.number().int().min(0).max(10_000).default(100),
  defaultTextualLayer: z.string().trim().max(200).nullable().optional(),
  defaultSourceType: z.string().trim().max(100).nullable().optional(),
  cacheTtlHours: z.number().int().min(1).max(8_760).default(168),
  notes: z.string().trim().max(2_000).nullable().optional(),
  isActive: z.boolean().default(true),
  approvalOrigin: z.enum(["human_manual", "mentor_review", "system_test_bulk", "imported_existing"]).default("human_manual"),
  approvalNote: z.string().trim().max(2_000).nullable().optional(),
  approvedByLabel: z.string().trim().max(200).nullable().optional(),
});
const updateSchema = baseSchema.partial().extend({ id: z.string().uuid() });

function normalizedRow(input: z.infer<typeof baseSchema>) {
  const domain = input.domain.toLowerCase().replace(/^\.+|\.+$/g, "");
  if (/[\/@:?#]/.test(domain)) throw new CorpusError("INVALID_INPUT", "Enter a hostname without a protocol or path.", 400);
  let exactUrl: string | null = null;
  let allowedPathPrefix: string | null = null;
  if (input.scopeType === "EXACT_URL") {
    if (!input.exactUrl) throw new CorpusError("INVALID_INPUT", "An exact URL is required for EXACT_URL scope.", 400);
    const parsed = normalizeResearchUrl(input.exactUrl);
    if (parsed.hostname !== domain) throw new CorpusError("INVALID_INPUT", "The exact URL hostname must match the registry domain.", 400);
    exactUrl = parsed.toString();
  } else if (input.scopeType === "PATH_PREFIX") {
    if (!input.allowedPathPrefix) throw new CorpusError("INVALID_INPUT", "A path prefix is required for PATH_PREFIX scope.", 400);
    allowedPathPrefix = input.allowedPathPrefix.startsWith("/") ? input.allowedPathPrefix : `/${input.allowedPathPrefix}`;
    normalizeResearchUrl(`https://${domain}${allowedPathPrefix}`);
  }
  return {
    display_name: input.displayName,
    domain,
    scope_type: input.scopeType,
    allowed_path_prefix: allowedPathPrefix,
    exact_url: exactUrl,
    include_subdomains: input.includeSubdomains,
    allow_live_search: input.allowLiveSearch,
    allow_live_fetch: input.allowLiveFetch,
    allow_ingestion: input.allowIngestion,
    evidence_use_status: input.evidenceUseStatus,
    priority: input.priority,
    default_textual_layer: input.defaultTextualLayer || null,
    default_source_type: input.defaultSourceType || null,
    cache_ttl_hours: input.cacheTtlHours,
    notes: input.notes || null,
    is_active: input.isActive,
    approval_origin: input.approvalOrigin,
    approval_note: input.approvalNote || null,
    approved_by_label: input.approvedByLabel || null,
    approved_at: input.evidenceUseStatus === "approved" ? new Date().toISOString() : null,
  };
}

export async function GET(request: NextRequest) {
  const denied = assertCorpusAdmin(request);
  if (denied) return denied;
  try {
    const [{ data: rules, error: ruleError }, { data: cache, error: cacheError }] = await Promise.all([
      supabaseAdmin.from("approved_source_access").select("*").order("priority").order("display_name"),
      supabaseAdmin.from("live_research_cache").select("id, access_id, canonical_url, retrieved_at, expires_at, last_accessed_at, hit_count, fetch_status, fetch_error, source_id").order("last_accessed_at", { ascending: false }).limit(100),
    ]);
    if (ruleError || cacheError) throw new CorpusError("DATABASE_FAILED", "Source-access administration could not be loaded.", 500, { cause: ruleError || cacheError });
    return NextResponse.json({ rules: rules || [], cache: cache || [] });
  } catch (error) {
    return corpusErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const denied = assertCorpusAdmin(request);
  if (denied) return denied;
  try {
    assertRequestSize(request);
    const parsed = baseSchema.safeParse(await request.json());
    if (!parsed.success) throw new CorpusError("INVALID_INPUT", "The source-access rule is invalid.", 400);
    const { data, error } = await supabaseAdmin.from("approved_source_access").insert(normalizedRow(parsed.data)).select("*").single();
    if (error) throw new CorpusError("DATABASE_FAILED", "The source-access rule could not be created.", 500, { cause: error });
    return NextResponse.json({ rule: data }, { status: 201 });
  } catch (error) {
    return corpusErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  const denied = assertCorpusAdmin(request);
  if (denied) return denied;
  try {
    assertRequestSize(request);
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) throw new CorpusError("INVALID_INPUT", "The source-access update is invalid.", 400);
    const { id, ...updates } = parsed.data;
    const { data: existing, error: readError } = await supabaseAdmin.from("approved_source_access").select("*").eq("id", id).single();
    if (readError || !existing) throw new CorpusError("DATABASE_FAILED", "The source-access rule was not found.", 404, { cause: readError || undefined });
    const complete = baseSchema.parse({
      displayName: updates.displayName ?? existing.display_name,
      domain: updates.domain ?? existing.domain,
      scopeType: updates.scopeType ?? existing.scope_type,
      allowedPathPrefix: updates.allowedPathPrefix === undefined ? existing.allowed_path_prefix : updates.allowedPathPrefix,
      exactUrl: updates.exactUrl === undefined ? existing.exact_url : updates.exactUrl,
      includeSubdomains: updates.includeSubdomains ?? existing.include_subdomains,
      allowLiveSearch: updates.allowLiveSearch ?? existing.allow_live_search,
      allowLiveFetch: updates.allowLiveFetch ?? existing.allow_live_fetch,
      allowIngestion: updates.allowIngestion ?? existing.allow_ingestion,
      evidenceUseStatus: updates.evidenceUseStatus ?? existing.evidence_use_status,
      priority: updates.priority ?? existing.priority,
      defaultTextualLayer: updates.defaultTextualLayer === undefined ? existing.default_textual_layer : updates.defaultTextualLayer,
      defaultSourceType: updates.defaultSourceType === undefined ? existing.default_source_type : updates.defaultSourceType,
      cacheTtlHours: updates.cacheTtlHours ?? existing.cache_ttl_hours,
      notes: updates.notes === undefined ? existing.notes : updates.notes,
      isActive: updates.isActive ?? existing.is_active,
      approvalOrigin: updates.approvalOrigin ?? existing.approval_origin,
      approvalNote: updates.approvalNote === undefined ? existing.approval_note : updates.approvalNote,
      approvedByLabel: updates.approvedByLabel === undefined ? existing.approved_by_label : updates.approvedByLabel,
    });
    const { data, error } = await supabaseAdmin.from("approved_source_access").update(normalizedRow(complete)).eq("id", id).select("*").single();
    if (error) throw new CorpusError("DATABASE_FAILED", "The source-access rule could not be updated.", 500, { cause: error });
    return NextResponse.json({ rule: data });
  } catch (error) {
    return corpusErrorResponse(error);
  }
}
