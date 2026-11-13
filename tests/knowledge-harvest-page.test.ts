import { describe, expect, it, vi } from "vitest";
import type { RetrievedPassage } from "@/lib/corpus/types";

const state = vi.hoisted(() => ({ preview: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/live-research/live-fetch", () => ({ fetchDiscoveryPreview: state.preview }));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { rpc: state.rpc } }));

const policy = { mode: "credible_web" as const, rules: [] };
const names = ["C. V. Raman", "Raman", "Chandrasekhara Venkata Raman"];
const page = (licence = "") => `<!doctype html><html><head><title>Sir Chandrasekhara Venkata Raman – Biographical</title>
<meta name="citation_title" content="Sir Chandrasekhara Venkata Raman – Biographical"><meta property="og:site_name" content="NobelPrize.org">
<meta name="citation_publisher" content="Nobel Prize Outreach">${licence}</head><body><nav>Menu Prizes Laureates</nav><main>
<h1>Sir Chandrasekhara Venkata Raman</h1><h2>Biographical</h2>
<p>Chandrasekhara Venkata Raman was born at Tiruchirappalli in Southern India on November 7th, 1888. His father was a lecturer in mathematics and physics so that from the first he was immersed in an academic atmosphere.</p>
<p>He entered Presidency College, Madras, in 1902, and in 1904 passed his B.A. examination, winning the first place and the gold medal in physics; in 1907 he gained his M.A. degree, obtaining the highest distinctions.</p>
<h2>Research</h2>
<p>In 1928 Raman discovered that when light is scattered by the molecules of a liquid, a small part of the scattered light changes its wavelength, an effect of light scattering now known as the Raman effect.</p>
<p>Raman founded the Indian Journal of Physics in 1926 and established the Indian Academy of Sciences in 1934, serving as its President from its inception.</p>
<p>Read more about the prize. Share this page.</p>
</main><footer>Copyright Nobel Prize Outreach</footer></body></html>`;
const url = "https://www.nobelprize.org/prizes/physics/1930/raman/biographical/";
const serve = (html: string) => state.preview.mockImplementation(async (requested: string) => ({ finalUrl: requested, status: 200, contentType: "text/html", html }));

describe("harvesting a real page shape", () => {
  it("finds the supporting passage, scores the work, and indexes other passages about the person", async () => {
    const { inspectSearchSource, readGroundedExcerpt } = await import("@/lib/live-research/search-credibility");
    const { runHarvest, resetHarvestStoreAvailability } = await import("@/lib/knowledge-harvest/harvest");
    resetHarvestStoreAvailability();
    serve(page());
    const question = "What did C. V. Raman discover about light scattering?";
    const source = await inspectSearchSource(url, policy, "Raman biographical");
    expect(source).toMatchObject({ domain: "www.nobelprize.org" });
    const excerpt = await readGroundedExcerpt(source!, question, names, policy);
    expect(excerpt?.text).toContain("In 1928 Raman discovered");
    expect(["EXACT", "STRONG"]).toContain(excerpt!.supportLevel);
    const passage: RetrievedPassage = { kind: "passage", id: "google:0:0", chunkId: "google:0:0", sourceId: "google:0", text: excerpt!.text,
      sectionTitle: null, pageOrSection: excerpt!.locator, textualLayer: null, sourceTitle: excerpt!.title, sourceAuthor: null,
      sourceInstitution: source!.domain, sourceUrl: excerpt!.url, sourceType: source!.category, sourceStatus: "discovered", origin: "google_grounding",
      supportLevel: excerpt!.supportLevel, supportReason: excerpt!.supportReason, evidenceType: excerpt!.identity.evidenceType, workKey: excerpt!.identity.workKey,
      accessibility: "READABLE", rightsDeclaration: excerpt!.rightsDeclaration,
      provenance: { title: excerpt!.identity.title, publisher: excerpt!.identity.publisher } };
    state.rpc.mockImplementation(async (name: string) => name === "knowledge_source_track_records" ? { data: [], error: null }
      : { data: { sources: 1, findings: 3, new_sources: 1, new_findings: 3, promotion_ready: 0 }, error: null });
    const outcome = await runHarvest({ personalityId: "11111111-1111-4111-8111-111111111111", personalityName: "C. V. Raman", aliases: names.slice(1),
      question, passages: [passage], citedChunkIds: new Set(["google:0:0"]), policy });
    expect(outcome.stored).toBe(true);
    const payload = state.rpc.mock.calls.find(([name]) => name === "record_knowledge_harvest")![1].p_harvest;
    const [stored] = payload.sources;
    expect(stored).toMatchObject({ authority_level: "authoritative", retention: "pointer_only", publisher: "Nobel Prize Outreach", cited: true });
    expect(["credible", "trusted"]).toContain(stored.tier);
    const deep = stored.findings.filter((finding: { kind: string }) => finding.kind === "deep_harvest");
    // Birth and institution-building are on the page but were not asked about. The education
    // paragraph says only "He", so it is not indexed: a pointer must name the person, as recall will.
    expect(deep.length).toBeGreaterThanOrEqual(2);
    const terms = deep.flatMap((finding: { topic_terms: string[] }) => finding.topic_terms);
    expect(terms).toEqual(expect.arrayContaining(["born", "1888", "academy", "1934"]));
    expect(terms).not.toContain("presidency");
    // No source prose is retained for a page without an open licence; navigation and footer text never appear.
    expect(stored.findings.every((finding: { excerpt: string | null }) => finding.excerpt === null)).toBe(true);
    expect(JSON.stringify(payload)).not.toMatch(/Share this page|Copyright Nobel|What did/);
  });
  it("keeps passages only when the page itself declares an open licence", async () => {
    const { readSubjectPassages } = await import("@/lib/live-research/search-credibility");
    const licensed = "https://www.nobelprize.org/licensed/raman/";
    serve(page('<link rel="license" href="https://creativecommons.org/licenses/by/4.0/">'));
    const passages = await readSubjectPassages(licensed, names, policy, 6);
    expect(passages.length).toBeGreaterThanOrEqual(2);
    expect(passages[0].rightsDeclaration).toBe("https://creativecommons.org/licenses/by/4.0/");
    expect(passages.every((item) => /Raman/.test(item.text) && item.text.length <= 600)).toBe(true);
  });
  it("keeps a locator short when a page marks a whole paragraph up as a heading", async () => {
    const { inspectSearchSource, readGroundedExcerpt } = await import("@/lib/live-research/search-credibility");
    const messy = "https://www.nobelprize.org/messy/raman/";
    const heading = "Raman and the long story of Indian physics in the twentieth century. ".repeat(8);
    serve(page().replace("<h2>Research</h2>", `<h2>${heading}</h2>`).replace("<title>", `<title>${"Very long title ".repeat(40)}`)
      .replace('content="Sir Chandrasekhara Venkata Raman – Biographical"', `content="${"Sir Chandrasekhara Venkata Raman ".repeat(20)}"`));
    const source = await inspectSearchSource(messy, policy, "Raman");
    const excerpt = await readGroundedExcerpt(source!, "What did C. V. Raman discover about light scattering?", names, policy);
    expect(excerpt?.text).toContain("In 1928 Raman discovered");
    expect(excerpt!.locator!.length).toBeLessThanOrEqual(200);
    expect(excerpt!.identity.title!.length).toBeLessThanOrEqual(300);
  });
  it("returns nothing for a page that never names the person or that policy blocks", async () => {
    const { readSubjectPassages } = await import("@/lib/live-research/search-credibility");
    serve(page());
    expect(await readSubjectPassages("https://www.nobelprize.org/other/", ["Jagadish Chandra Bose"], policy)).toEqual([]);
    expect(await readSubjectPassages("https://www.nobelprize.org/blocked/", names, { mode: "credible_web",
      rules: [{ id: "1", domain: "nobelprize.org", display_name: "N", status: "blocked", category: "other", notes: "" }] })).toEqual([]);
  });
});
