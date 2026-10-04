import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { CorpusError } from "@/lib/corpus/errors";
import type { SourceAccessRule } from "./source-policy";

export async function loadActiveSourceRules(): Promise<SourceAccessRule[]> {
  const { data, error } = await supabaseAdmin
    .from("approved_source_access")
    .select("id, display_name, domain, scope_type, allowed_path_prefix, exact_url, include_subdomains, allow_live_search, allow_live_fetch, allow_ingestion, evidence_use_status, approval_origin, priority, default_textual_layer, default_source_type, cache_ttl_hours, is_active")
    .eq("is_active", true)
    .order("priority");
  if (error) throw new CorpusError("DATABASE_FAILED", "The approved-source registry could not be loaded.", 500, { cause: error });
  return (data || []) as SourceAccessRule[];
}
