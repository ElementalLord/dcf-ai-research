import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchDiscoveryPreview } from "./live-fetch";
import { canonicalResearchUrl, selectSourceAuthorization, type SourceAccessRule } from "./source-policy";
import { duplicateWorkOf, inheritedInstitutionForUrl, relevantChildLinks, rejectedVerification, verifiedFamilyScope, verifyCandidate, type Verification } from "./verification";

export async function verifyAndAdmitCandidate(input: {
  runId: string; url: string; aliases: string[]; rules: SourceAccessRule[]; autoAdmit: boolean; parameterCode?: string | null;
}): Promise<{ verification: Verification; rules: SourceAccessRule[]; linkedCandidates: string[] }> {
  let verification: Verification;
  let linkedCandidates: string[] = [];
  try {
    const canonical = canonicalResearchUrl(input.url);
    const preview = await fetchDiscoveryPreview(canonical);
    linkedCandidates = relevantChildLinks(preview.html, preview.finalUrl, input.aliases);
    const final = new URL(canonicalResearchUrl(preview.finalUrl));
    const { data: families, error: familyError } = await supabaseAdmin.from("verified_source_families")
      .select("domain,path_prefix,institution").eq("domain", final.hostname);
    if (familyError) throw familyError;
    verification = verifyCandidate({ candidateUrl: input.url, ...preview, personalityAliases: input.aliases,
      rules: input.rules, autoAdmit: input.autoAdmit,
      inheritedInstitution: inheritedInstitutionForUrl(preview.finalUrl, families || []) });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Candidate verification failed";
    verification = rejectedVerification(input.url, "REJECTED_SECURITY", reason);
  }

  if (verification.verification_status === "APPROVED_FOR_EVIDENCE" && verification.independent_work_key) {
    const { data: mirrors, error: mirrorError } = await supabaseAdmin.from("research_candidates")
      .select("canonical_url,independent_work_key").eq("independent_work_key", verification.independent_work_key)
      .eq("verification_status", "APPROVED_FOR_EVIDENCE").neq("canonical_url", verification.canonical_url).limit(1);
    if (mirrorError) throw mirrorError;
    const duplicateUrl = duplicateWorkOf(verification, mirrors || []);
    if (duplicateUrl) verification = { ...verification, verification_status: "REJECTED_DUPLICATE",
      verification_reason: `Same underlying work already admitted at ${duplicateUrl}`,
      credibility_failures: [...verification.credibility_failures, "Duplicate underlying work"], approval_origin: null };
  }

  const record = async () => {
    const { error } = await supabaseAdmin.from("research_candidates").upsert({
      ...verification, run_id: input.runId, relevant_parameters: input.parameterCode ? [input.parameterCode] : [],
    }, { onConflict: "run_id,canonical_url" });
    if (error) throw error;
  };
  if (verification.verification_status !== "APPROVED_FOR_EVIDENCE") {
    await record();
    return { verification, rules: input.rules, linkedCandidates };
  }

  const existing = selectSourceAuthorization(verification.canonical_url, input.rules, "fetch", true);
  if (existing) { await record(); return { verification, rules: input.rules, linkedCandidates }; }
  const { data, error } = await supabaseAdmin.from("approved_source_access").insert({
    display_name: verification.title || verification.work_title || verification.canonical_url,
    domain: verification.domain, scope_type: "EXACT_URL", exact_url: verification.canonical_url,
    allowed_path_prefix: null, include_subdomains: false, allow_live_search: false,
    allow_live_fetch: true, allow_ingestion: true, evidence_use_status: "approved",
    approval_origin: "verified_auto", approval_note: verification.verification_reason,
    approved_at: verification.verified_at, priority: 50, cache_ttl_hours: 168,
    default_textual_layer: verification.textual_layer,
    default_source_type: verification.source_type, is_active: true,
  }).select("*").single();
  let admittedRule = data as SourceAccessRule | null;
  if (error || !admittedRule) {
    const { data: raced } = await supabaseAdmin.from("approved_source_access").select("*")
      .eq("exact_url", verification.canonical_url).eq("evidence_use_status", "approved").eq("is_active", true).maybeSingle();
    admittedRule = raced as SourceAccessRule | null;
  }
  if (!admittedRule) {
    verification = { ...verification, verification_status: "REJECTED_UNVERIFIABLE", approval_origin: null,
      verification_reason: "Verified metadata, but evidence admission failed", credibility_failures: [...verification.credibility_failures, "Evidence admission failed"] };
    await record();
    return { verification, rules: input.rules, linkedCandidates };
  }
  await record();
  return { verification, rules: [...input.rules, admittedRule], linkedCandidates };
}

export async function promoteVerifiedFamily(verification: Verification): Promise<boolean> {
  if (verification.verification_status !== "APPROVED_FOR_EVIDENCE" || !verification.source_family) return false;
  const { data, error } = await supabaseAdmin.from("research_candidates")
    .select("canonical_url,domain,institution,source_family,verification_status")
    .eq("domain", verification.domain).eq("source_family", verification.source_family)
    .eq("verification_status", "APPROVED_FOR_EVIDENCE").limit(20);
  if (error) throw error;
  const scope = verifiedFamilyScope((data || []) as Verification[]);
  if (!scope || !verification.institution) return false;
  const { error: saveError } = await supabaseAdmin.from("verified_source_families").upsert({
    domain: scope.domain, path_prefix: scope.path, institution: verification.institution,
    project_label: verification.source_family,
    supporting_urls: (data || []).map((item) => item.canonical_url).slice(0, 20),
  }, { onConflict: "domain,path_prefix" });
  if (saveError) throw saveError;
  return true;
}
