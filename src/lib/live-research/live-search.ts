import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeForMatch } from "@/lib/corpus/text";
import { fetchApprovedResource } from "./live-fetch";
import { canonicalResearchUrl, selectSourceAuthorization, type SourceAccessRule } from "./source-policy";

export type DiscoveryResult = {
  accepted: string[];
  rejected: Array<{ url: string; reason: string }>;
  approvedSourcesConsidered: string[];
};

function terms(question: string): string[] {
  const ignored = new Set(["what", "when", "where", "which", "with", "from", "does", "about", "vishvamitra", "vishwamitra", "visvamitra", "the", "and", "his"]);
  return normalizeForMatch(question).split(" ").filter((term) => term.length > 2 && !ignored.has(term));
}

function scoreUrl(url: string, label: string, questionTerms: string[]): number {
  const searchable = normalizeForMatch(`${url} ${label}`);
  return questionTerms.reduce((score, term) => score + (searchable.includes(term) ? 1 : 0), 0);
}

function extractLocations(xml: string): string[] {
  return [...xml.matchAll(/<loc(?:\s[^>]*)?>\s*([^<]+?)\s*<\/loc>/gi)].map((match) => match[1].replace(/&amp;/g, "&").trim());
}

export async function discoverApprovedUrls(question: string, rules: SourceAccessRule[], limit = 8): Promise<DiscoveryResult> {
  const questionTerms = terms(question);
  const candidates = new Map<string, { label: string; score: number }>();
  const rejected: Array<{ url: string; reason: string }> = [];
  const approvedRules = rules.filter((rule) => rule.is_active && rule.allow_live_fetch && rule.evidence_use_status === "approved");

  for (const rule of approvedRules) {
    if (rule.scope_type === "EXACT_URL" && rule.exact_url) {
      candidates.set(canonicalResearchUrl(rule.exact_url), { label: rule.display_name, score: scoreUrl(rule.exact_url, rule.display_name, questionTerms) + 2 });
    }
  }

  const [{ data: sources }, { data: cached }] = await Promise.all([
    supabaseAdmin.from("sources").select("title, url").eq("source_status", "approved").not("url", "is", null).limit(500),
    supabaseAdmin.from("live_research_cache").select("title, canonical_url").eq("fetch_status", "ready").limit(500),
  ]);
  for (const item of [...(sources || []).map((row) => ({ label: row.title, url: row.url })), ...(cached || []).map((row) => ({ label: row.title || "Cached source", url: row.canonical_url }))]) {
    if (!item.url) continue;
    const authorization = selectSourceAuthorization(item.url, approvedRules, "fetch", true);
    if (!authorization) {
      rejected.push({ url: item.url, reason: "SOURCE_NOT_APPROVED" });
      continue;
    }
    const canonical = canonicalResearchUrl(item.url);
    candidates.set(canonical, { label: item.label, score: scoreUrl(canonical, item.label, questionTerms) + 1 });
  }

  const sitemapRules = approvedRules.filter((rule) => rule.scope_type === "DOMAIN" && rule.allow_live_search).slice(0, 3);
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
