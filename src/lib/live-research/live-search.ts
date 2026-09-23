import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeForMatch } from "@/lib/corpus/text";
import { fetchApprovedResource } from "./live-fetch";
import { canonicalResearchUrl, selectSourceAuthorization, type SourceAccessRule } from "./source-policy";
import { canonicalizeTerms, type TermAliasRecord } from "@/lib/corpus/personality-config";

export type DiscoveryResult = {
  accepted: string[];
  rejected: Array<{ url: string; reason: string }>;
  approvedSourcesConsidered: string[];
};

function terms(question: string, personalityAliases: string[], termAliases: TermAliasRecord[]): string[] {
  const ignored = new Set(["what", "when", "where", "which", "with", "from", "does", "about", "the", "and", "his"]);
  for (const alias of personalityAliases) {
    for (const token of normalizeForMatch(alias).split(" ")) ignored.add(token);
  }
  return canonicalizeTerms(question, termAliases).split(" ").filter((term) => term.length > 2 && !ignored.has(term));
}

function scoreUrl(url: string, label: string, questionTerms: string[]): number {
  const searchable = normalizeForMatch(`${url} ${label}`);
  return questionTerms.reduce((score, term) => score + (searchable.includes(term) ? 1 : 0), 0);
}

function extractLocations(xml: string): string[] {
  return [...xml.matchAll(/<loc(?:\s[^>]*)?>\s*([^<]+?)\s*<\/loc>/gi)].map((match) => match[1].replace(/&amp;/g, "&").trim());
}

export async function discoverApprovedUrls(
  question: string,
  rules: SourceAccessRule[],
  limit = 8,
  options: { personalityId?: string; personalityAliases?: string[]; termAliases?: TermAliasRecord[] } = {},
): Promise<DiscoveryResult> {
  const questionTerms = terms(question, options.personalityAliases || [], options.termAliases || []);
  const candidates = new Map<string, { label: string; score: number }>();
  const rejected: Array<{ url: string; reason: string }> = [];
  const approvedRules = rules.filter((rule) => rule.is_active && rule.allow_live_fetch && rule.evidence_use_status === "approved");

  const [{ data: sources }, { data: cached }] = await Promise.all([
    options.personalityId
      ? supabaseAdmin.from("sources").select("id, title, url, source_personalities!inner(personality_id)").eq("source_status", "approved").eq("source_personalities.personality_id", options.personalityId).not("url", "is", null).limit(500)
      : supabaseAdmin.from("sources").select("id, title, url").eq("source_status", "approved").not("url", "is", null).limit(500),
    supabaseAdmin.from("live_research_cache").select("title, canonical_url, source_id").eq("fetch_status", "ready").limit(500),
  ]);
  const mappedSourceIds = new Set((sources || []).map((source) => source.id));
  const mappedUrls = new Set((sources || []).map((source) => source.url ? canonicalResearchUrl(source.url) : null).filter(Boolean));
  for (const rule of approvedRules) {
    if (rule.scope_type === "EXACT_URL" && rule.exact_url && (!options.personalityId || mappedUrls.has(canonicalResearchUrl(rule.exact_url)))) {
      candidates.set(canonicalResearchUrl(rule.exact_url), { label: rule.display_name, score: scoreUrl(rule.exact_url, rule.display_name, questionTerms) + 2 });
    }
  }
  for (const item of [...(sources || []).map((row) => ({ label: row.title, url: row.url })), ...(cached || []).filter((row) => !options.personalityId || (row.source_id && mappedSourceIds.has(row.source_id))).map((row) => ({ label: row.title || "Cached source", url: row.canonical_url }))]) {
    if (!item.url) continue;
    const authorization = selectSourceAuthorization(item.url, approvedRules, "fetch", true);
    if (!authorization) {
      rejected.push({ url: item.url, reason: "SOURCE_NOT_APPROVED" });
      continue;
    }
    const canonical = canonicalResearchUrl(item.url);
    candidates.set(canonical, { label: item.label, score: scoreUrl(canonical, item.label, questionTerms) + 1 });
  }

  const mappedRuleIds = new Set((sources || []).flatMap((source) => {
    if (!source.url) return [];
    const authorization = selectSourceAuthorization(source.url, approvedRules, "fetch", true);
    return authorization ? [authorization.id] : [];
  }));
  const sitemapRules = approvedRules.filter((rule) => rule.scope_type === "DOMAIN" && rule.allow_live_search && (!options.personalityId || mappedRuleIds.has(rule.id))).slice(0, 3);
  const sitemapResults = await Promise.allSettled(sitemapRules.map(async (rule) => {
    const sitemapUrl = `https://${rule.domain}/sitemap.xml`;
    const response = await fetchApprovedResource(sitemapUrl, { rules: approvedRules, requireEvidenceApproval: false, acceptXml: true, capability: "search" });
    if (!response.bytes) return [];
    return extractLocations(new TextDecoder().decode(response.bytes)).slice(0, 2_000);
  }));
  sitemapResults.forEach((result) => {
    if (result.status !== "fulfilled") return;
    for (const url of result.value) {
      if (/\.xml(?:$|\?)/i.test(url)) continue;
      const authorization = selectSourceAuthorization(url, approvedRules, "fetch", true);
      if (!authorization) {
        rejected.push({ url, reason: "SOURCE_NOT_APPROVED" });
        continue;
      }
      const score = scoreUrl(url, authorization.display_name, questionTerms);
      if (score > 0) candidates.set(canonicalResearchUrl(url), { label: authorization.display_name, score });
    }
  });

  const accepted = [...candidates.entries()]
    .sort((left, right) => right[1].score - left[1].score || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([url]) => url);
  return {
    accepted,
    rejected: rejected.slice(0, 50),
    approvedSourcesConsidered: [...new Set(approvedRules.map((rule) => rule.display_name))],
  };
}
