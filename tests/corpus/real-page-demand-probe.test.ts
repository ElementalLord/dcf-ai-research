import { describe, expect, it } from "vitest";
import { executeDemandResearch } from "@/lib/live-research/on-demand-engine";
import { productionResearchDependencies } from "@/lib/live-research/on-demand-adapter";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { readGroundedExcerpt } from "@/lib/live-research/search-credibility";

const enabled = process.env.DCF_REAL_PAGE_VALIDATION === "true";
(enabled ? describe : describe.skip)("no-cost original-page demand probe", () => {
  it("extracts the date assertion from the actual Stanford source page without a paid provider", async () => {
    const url = "https://plato.stanford.edu/entries/shankara/";
    const result = await readGroundedExcerpt(
      { url, domain: "plato.stanford.edu", category: "scholarly", title: "Śaṅkara" },
      "What dates does Nakamura propose for Shankara? Shankara dating Nakamura 700 750",
      ["Shankara", "Sankara"], { mode: "credible_web", rules: [] },
    );
    expect(result?.supportLevel).toMatch(/EXACT|STRONG/);
    expect(result?.text).toContain("Nakamura");
    expect(result?.text).toContain("700–750 CE");
    expect(result?.locator).toContain("Life and Works");
  }, 30_000);

  it("uses the existing source inspection path with fixture discovery and no provider billing", async () => {
    const url = "https://plato.stanford.edu/entries/shankara/";
    let searches = 0;
    const deps = {
      ...productionResearchDependencies(),
      provider: { name: "fixture-discovery", isConfigured: () => true,
        async search() { searches++; return [{ title: "Shankara", url, sourceProvider: "fixture" }]; } },
      async claimNeed() { return "acquired" as const; },
      async finishNeed() {},
      async existingSourceId() { return null; },
      reserveBudget: undefined,
    };
    let preflight: string;
    try { preflight = `robots=${await deps.robotsAllowed(url)}`; }
    catch (error) { preflight = `robots_error=${error instanceof Error ? error.message : String(error)}`; }
    console.log(`demand_real_page_preflight ${preflight}`);
    const policyRows = await Promise.all([supabaseAdmin.from("search_policy").select("mode").eq("id", true).single(),
      supabaseAdmin.from("search_source_rules").select("id,domain,display_name,status,category,notes").order("domain")]);
    console.log(`demand_real_page_policy ${JSON.stringify(policyRows.map((row) => ({ error: row.error?.message, code: row.error?.code, count: Array.isArray(row.data) ? row.data.length : row.data ? 1 : 0 })))}`);
    try { console.log(`demand_real_page_inspection ${JSON.stringify(await deps.inspect(url, "Shankara"))}`); }
    catch (error) { console.log(`demand_real_page_inspection_error ${error instanceof Error ? error.message : String(error)}`); }
    const request = { needId: "launch-no-cost-real-page-probe", personalityId: "32e53e02-71cd-4232-9d33-247d37f039a7",
      personalityName: "Adi Shankaracharya", normalizedIntent: "Shankara scholarly dating", category: "NARROW_FACT" as const,
      gaps: [{ id: "launch-dating-gap", requirementKey: "date", type: "chronology" as const,
        requirement: "A scholarly source explicitly states an estimated date range for Shankara", subjectId: "32e53e02-71cd-4232-9d33-247d37f039a7",
        topic: "Shankara dating Nakamura 700 750", suitableSources: ["scholarly source"], completion: "Source inspected", contested: false }],
      existingEvidenceIds: [], maxExternalSearches: 1 };
    const result = await executeDemandResearch(request, "What dates does Nakamura propose for Shankara?", [],
      ["Shankara", "Sankara"], deps);
    console.log(JSON.stringify({ status: result.status, candidates: result.candidates, findings: result.findings.map((finding) => ({
      url: finding.source.url, locator: finding.passage.locator, passage: finding.passage.text.slice(0, 300),
      support: finding.passage.supportLevel, retention: finding.retention, verificationReady: finding.verificationReady })), usage: result.usage }));
    expect(searches).toBe(1);
    expect(result.usage.searchCalls).toBe(1);
    expect(result.usage.sourceFetches).toBeLessThanOrEqual(1);
  }, 30_000);
});
