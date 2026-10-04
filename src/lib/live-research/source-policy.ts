import { CorpusError } from "@/lib/corpus/errors";

export type SourceScope = "DOMAIN" | "PATH_PREFIX" | "EXACT_URL";
export type SourceCapability = "search" | "fetch" | "ingest";

export type SourceAccessRule = {
  id: string;
  display_name: string;
  domain: string;
  scope_type: SourceScope;
  allowed_path_prefix: string | null;
  exact_url: string | null;
  include_subdomains: boolean;
  allow_live_search: boolean;
  allow_live_fetch: boolean;
  allow_ingestion: boolean;
  evidence_use_status: "candidate" | "approved" | "rejected";
  approval_origin?: "human_manual" | "mentor_review" | "system_test_bulk" | "imported_existing" | "ai_candidate";
  priority: number;
  default_textual_layer: string | null;
  default_source_type: string | null;
  cache_ttl_hours: number;
  is_active: boolean;
};

function decodePolicyPath(pathname: string): string {
  let decoded = pathname;
  for (let pass = 0; pass < 2; pass += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      throw new CorpusError("SOURCE_NOT_APPROVED", "The URL path contains invalid encoding.", 403);
    }
  }
  if (decoded.includes("\\") || /[\u0000-\u001f\u007f]/.test(decoded)) {
    throw new CorpusError("SOURCE_NOT_APPROVED", "The URL path contains unsafe characters.", 403);
  }
  return decoded.replace(/\/{2,}/g, "/");
}

export function normalizeResearchUrl(rawUrl: string): URL {
  const rawPath = rawUrl.match(/^https?:\/\/[^/?#]+([^?#]*)/i)?.[1] || "/";
  let decodedPath = rawPath;
  for (let pass = 0; pass < 2; pass++) {
    try { decodedPath = decodeURIComponent(decodedPath); }
    catch { throw new CorpusError("SOURCE_NOT_APPROVED", "The URL path contains invalid encoding.", 403); }
  }
  if (decodedPath.split("/").some((part) => part === "." || part === "..") || decodedPath.includes("\\")) {
    throw new CorpusError("SOURCE_NOT_APPROVED", "The URL path contains traversal segments.", 403);
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new CorpusError("SOURCE_NOT_APPROVED", "The research URL is invalid.", 403);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new CorpusError("SOURCE_NOT_APPROVED", "Only HTTP and HTTPS research URLs are eligible.", 403);
  }
  if (url.username || url.password) {
    throw new CorpusError("SOURCE_NOT_APPROVED", "Research URLs cannot contain user information.", 403);
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new CorpusError("SOURCE_NOT_APPROVED", "Research URLs cannot use non-standard ports.", 403);
  }
  url.hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  url.pathname = decodePolicyPath(url.pathname);
  url.hash = "";
  return url;
}

export function canonicalResearchUrl(rawUrl: string): string {
  const url = normalizeResearchUrl(rawUrl);
  if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) url.port = "";
  return url.toString();
}

function hostnameMatches(url: URL, rule: SourceAccessRule): boolean {
  const domain = rule.domain.toLowerCase().replace(/\.$/, "");
  return url.hostname === domain || (rule.include_subdomains && url.hostname.endsWith(`.${domain}`));
}

function pathMatches(pathname: string, prefixValue: string): boolean {
  const prefix = decodePolicyPath(prefixValue.startsWith("/") ? prefixValue : `/${prefixValue}`);
  const withoutSlash = prefix.length > 1 && prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  return pathname === withoutSlash || pathname.startsWith(`${withoutSlash}/`);
}

function capabilityAllowed(rule: SourceAccessRule, capability: SourceCapability): boolean {
  if (capability === "search") return rule.allow_live_search;
  if (capability === "ingest") return rule.allow_ingestion;
  return rule.allow_live_fetch;
}

function specificity(rule: SourceAccessRule): number {
  if (rule.scope_type === "EXACT_URL") return 3_000_000;
  if (rule.scope_type === "PATH_PREFIX") return 2_000_000 + (rule.allowed_path_prefix?.length || 0);
  return 1_000_000;
}

export function selectSourceAuthorization(
  rawUrl: string,
  rules: SourceAccessRule[],
  capability: SourceCapability,
  requireEvidenceApproval = false,
): SourceAccessRule | null {
  const url = normalizeResearchUrl(rawUrl);
  const canonical = canonicalResearchUrl(url.toString());
  const narrowest = rules
    .filter((rule) => {
      if (!rule.is_active) return false;
      if (!hostnameMatches(url, rule)) return false;
      if (rule.scope_type === "EXACT_URL") {
        return Boolean(rule.exact_url) && canonicalResearchUrl(rule.exact_url as string) === canonical;
      }
      if (rule.scope_type === "PATH_PREFIX") {
        return Boolean(rule.allowed_path_prefix) && pathMatches(url.pathname, rule.allowed_path_prefix as string);
      }
      return true;
    })
    .sort((left, right) => specificity(right) - specificity(left) || left.priority - right.priority)[0] || null;
  if (!narrowest || !capabilityAllowed(narrowest, capability)) return null;
  if (requireEvidenceApproval && narrowest.evidence_use_status !== "approved") return null;
  return narrowest;
}

export function assertUrlApprovedForResearch(
  rawUrl: string,
  rules: SourceAccessRule[],
  capability: SourceCapability,
  requireEvidenceApproval = false,
): SourceAccessRule {
  const selected = selectSourceAuthorization(rawUrl, rules, capability, requireEvidenceApproval);
  if (!selected) {
    throw new CorpusError("SOURCE_NOT_APPROVED", "The URL is outside the approved research source registry.", 403);
  }
  return selected;
}

export function assertRedirectApproved(
  destination: string,
  rules: SourceAccessRule[],
  capability: SourceCapability = "fetch",
  requireEvidenceApproval = true,
): SourceAccessRule {
  try {
    return assertUrlApprovedForResearch(destination, rules, capability, requireEvidenceApproval);
  } catch (error) {
    throw new CorpusError("REDIRECT_NOT_APPROVED", "The approved source redirected to an unapproved destination.", 403, { cause: error });
  }
}
