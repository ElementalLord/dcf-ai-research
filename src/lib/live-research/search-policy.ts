import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { CorpusError } from "@/lib/corpus/errors";
import { canonicalResearchUrl } from "./source-policy";

export type SearchMode = "credible_web" | "approved_domains_only" | "custom";
export type SearchRule = { id: string; domain: string; display_name: string; status: "allowed" | "blocked" | "disabled"; category: string; notes: string };
export type SearchPolicy = { mode: SearchMode; rules: SearchRule[] };

export function normalizeSearchDomain(value: string): string {
  const candidate = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  if (candidate.length > 253 || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(candidate)
    || !candidate.includes(".") || candidate.split(".").some((label) => !label || label.length > 63 || label.startsWith("-") || label.endsWith("-")))
    throw new CorpusError("INVALID_INPUT", "Enter a valid public domain.", 400);
  return candidate;
}

export function searchPolicyDecision(rawUrl: string, policy: SearchPolicy): { allowed: boolean; reason: string; rule: SearchRule | null } {
  let host: string;
  try {
    const url = new URL(canonicalResearchUrl(rawUrl));
    if (url.protocol !== "https:") return { allowed: false, reason: "HTTPS_REQUIRED", rule: null };
    host = url.hostname;
  } catch { return { allowed: false, reason: "UNSAFE_URL", rule: null }; }
  const matching = policy.rules.filter((entry) => host === entry.domain || host.endsWith(`.${entry.domain}`));
  const rule = matching.find((entry) => entry.status === "blocked") || matching
    .sort((a, b) => b.domain.length - a.domain.length)[0] || null;
  if (rule?.status === "blocked" || rule?.status === "disabled") return { allowed: false, reason: rule.status.toUpperCase(), rule };
  if (rule?.status === "allowed") return { allowed: true, reason: "EXPLICITLY_ALLOWED", rule };
  return policy.mode === "approved_domains_only"
    ? { allowed: false, reason: "NOT_ON_ALLOWLIST", rule: null }
    : { allowed: true, reason: "CREDIBILITY_CHECK_REQUIRED", rule: null };
}

export async function loadSearchPolicy(): Promise<SearchPolicy> {
  const [setting, rules] = await Promise.all([
    supabaseAdmin.from("search_policy").select("mode").eq("id", true).single(),
    supabaseAdmin.from("search_source_rules").select("id,domain,display_name,status,category,notes").order("domain"),
  ]);
  if (setting.error || rules.error) {
    if (setting.error?.code === "42P01" && rules.error?.code === "42P01") return { mode: "credible_web", rules: [] };
    throw new CorpusError("DATABASE_FAILED", "Search policy could not be loaded.", 500, { cause: setting.error || rules.error });
  }
  return { mode: setting.data.mode as SearchMode, rules: (rules.data || []) as SearchRule[] };
}

export async function recordDiscoveredSource(rawUrl: string, title: string, category: string) {
  try {
    const url = new URL(canonicalResearchUrl(rawUrl));
    await supabaseAdmin.from("discovered_search_sources").upsert({ domain: url.hostname, example_url: url.toString(), display_name: title.slice(0, 200), category }, { onConflict: "domain", ignoreDuplicates: true });
  } catch { /* Discovery tracking cannot block an answer. */ }
}
