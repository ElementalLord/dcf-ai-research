import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { assertSafePublicUrl } from "@/lib/corpus/security";
import { BraveSearchProvider } from "./web-search-provider";
import { inspectSearchSource, readGroundedExcerpt } from "./search-credibility";
import { loadSearchPolicy } from "./search-policy";
import { canonicalResearchUrl } from "./source-policy";
import type { ResearchDependencies } from "./on-demand-engine";
import { reserveResearchBudget } from "./research-budget";
import { searchPmcArticles } from "./pmc-discovery";

export function robotsDecision(text: string, path: string): boolean {
  const groups: Array<{ agents: string[]; rules: Array<{ path: string; allow: boolean }> }> = [];
  let group = { agents: [] as string[], rules: [] as Array<{ path: string; allow: boolean }> };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === "user-agent") {
      if (group.rules.length) { groups.push(group); group = { agents: [], rules: [] }; }
      group.agents.push(value.toLowerCase());
      continue;
    }
    if ((key === "allow" || key === "disallow") && value.startsWith("/")) group.rules.push({ path: value, allow: key === "allow" });
  }
  groups.push(group);
  const specific = groups.filter((item) => item.agents.some((agent) => agent.length > 0 && agent !== "*" && "dcf-ai-research".startsWith(agent)));
  const applicable = specific.length ? specific : groups.filter((item) => item.agents.includes("*"));
  let best = -1;
  let allowed = true;
  for (const item of applicable) for (const rule of item.rules) {
    const anchored = rule.path.endsWith("$");
    const pattern = anchored ? rule.path.slice(0, -1) : rule.path;
    const expression = `^${pattern.split("*").map((piece) => piece.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}${anchored ? "$" : ""}`;
    if (!new RegExp(expression).test(path)) continue;
    const length = pattern.replace(/\*/g, "").length;
    if (length > best || length === best && rule.allow) { best = length; allowed = rule.allow; }
  }
  return allowed;
}

async function robotsAllowed(rawUrl: string): Promise<boolean> {
  const target = await assertSafePublicUrl(rawUrl);
  const robots = new URL("/robots.txt", target);
  const safe = await assertSafePublicUrl(robots.toString());
  try {
    const response = await fetch(safe, { redirect: "manual", signal: AbortSignal.timeout(5_000), cache: "no-store",
      headers: { "User-Agent": "DCF-AI-Research/1.0 (+controlled-approved-source-research)" } });
    if (response.status === 404) return true;
    if (response.status >= 300 && response.status < 400) return false;
    if (!response.ok || Number(response.headers.get("content-length") || 0) > 64_000) return false;
    const reader = response.body?.getReader();
    if (!reader) return false;
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 64_000) { await reader.cancel(); return false; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return robotsDecision(new TextDecoder().decode(bytes), target.pathname);
  } catch { return false; }
}

export function productionResearchDependencies(): ResearchDependencies {
  // Start policy loading only when a source is inspected. An early provider or
  // coordination failure must not leave a rejected, unobserved promise behind.
  let policy: ReturnType<typeof loadSearchPolicy> | undefined;
  const getPolicy = () => policy ??= loadSearchPolicy();
  const robots = new Map<string, Promise<boolean>>();
  const checkRobots = (url: string) => {
    if (!robots.has(url)) robots.set(url, robotsAllowed(url));
    return robots.get(url)!;
  };
  return {
    provider: new BraveSearchProvider(),
    openAccessSearch: searchPmcArticles,
    async reserveBudget(requestId) {
      const planned = process.env.DEMAND_AUTO_ADMISSION_ENABLED === "true" || process.env.DEMAND_VERIFICATION_SHADOW_ENABLED === "true" ? 8 : 3;
      return reserveResearchBudget(requestId, planned);
    },
    async claimNeed(needId, personalityId, owner) {
      const { data, error } = await supabaseAdmin.rpc("claim_demand_research_need", { p_need_id: needId, p_personality_id: personalityId, p_owner: owner });
      if (error || !["acquired", "active", "cooldown"].includes(String(data))) throw new Error("COORDINATION_UNAVAILABLE");
      return data as "acquired" | "active" | "cooldown";
    },
    async finishNeed(needId, owner, status, calls, outcome, cooldownSeconds) {
      const { data, error } = await supabaseAdmin.rpc("finish_demand_research_need", { p_need_id: needId, p_owner: owner,
        p_status: status, p_search_calls: calls, p_outcome: outcome, p_cooldown_seconds: cooldownSeconds });
      if (error || data !== true) throw new Error("COORDINATION_FINISH_FAILED");
    },
    async inspect(url, title) {
      if (!await checkRobots(url)) return null;
      const exactUrl = canonicalResearchUrl(url);
      const { data, error } = await supabaseAdmin.from("metadata_admission_permissions")
        .select("source_url,publisher").eq("source_url", exactUrl).eq("is_active", true).maybeSingle();
      if (error) throw error;
      return inspectSearchSource(url, await getPolicy(), title, [], data?.publisher ? data.source_url : null);
    },
    robotsAllowed: checkRobots,
    async read(source, statement, aliases) { return readGroundedExcerpt(source, statement, aliases, await getPolicy()); },
    async existingSourceId(url) {
      const { data, error } = await supabaseAdmin.from("sources").select("id").eq("url", url).eq("source_status", "approved").limit(1).maybeSingle();
      if (error) throw error;
      return data?.id || null;
    },
  };
}
