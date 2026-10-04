import { describe, expect, it, vi } from "vitest";
import { duplicateWorkOf, verifyCandidate, verifiedFamilyScope, inheritedInstitutionForUrl, relevantChildLinks, projectDescriptionEvidence, projectDescriptionLinks } from "@/lib/live-research/verification";
import { evaluateDepth, type DepthParameter } from "@/lib/live-research/depth";
import { adaptiveStopReason } from "@/lib/live-research/expansion-run-policy";
import { fetchDiscoveryPreview } from "@/lib/live-research/live-fetch";
import { sectionsFromHtml } from "@/lib/corpus/source-extract";

const article = (license = true) => `<html><head><title>Vishvamitra and Vedic Traditions</title>
  <meta name="citation_institution" content="Example University">
  <meta name="citation_author" content="A. Scholar">
  <meta name="citation_publisher" content="Example University Press">
  <meta name="citation_journal_title" content="Journal of Vedic Studies">
  <meta name="citation_date" content="2021">
  <meta name="citation_doi" content="10.1234/example.2021.7">
  ${license ? '<link rel="license" href="https://creativecommons.org/licenses/by/4.0/">' : ""}
  </head><body><article><h1>Vishvamitra</h1><p>${"A detailed scholarly discussion of Vishvamitra and the textual record. ".repeat(30)}</p></article></body></html>`;

const verify = (html: string, url = "https://example.edu/project/vedic/article", extra = {}) => verifyCandidate({
  candidateUrl: url, finalUrl: url, status: 200, contentType: "text/html", html,
  personalityAliases: ["Vishvamitra"], rules: [], autoAdmit: true, ...extra,
});

describe("adaptive verification", () => {
  it("admits a previously unknown institutional original only with explicit provenance and access", () => {
    const result = verify(article());
    expect(result.verification_status).toBe("APPROVED_FOR_EVIDENCE");
    expect(result.approval_origin).toBe("verified_auto");
    expect(result.credibility_signals).toContain("Named institution: Example University");
    expect(result.independent_work_key).toBe("10.1234/example.2021.7");
  });
  it("can verify a scholarly publisher outside institutional host suffixes", () => {
    const result = verify(article(), "https://scholarly-publisher.com/journals/vedic/article");
    expect(result.verification_status).toBe("APPROVED_FOR_EVIDENCE");
    expect(result.source_type).toBe("scholarly_article");
  });
  it("keeps credible paywalled or unlicensed records bibliographic only", () => {
    expect(verify(article(false)).verification_status).toBe("BIBLIOGRAPHIC_ONLY");
    expect(verify(article(), undefined, { autoAdmit: false }).verification_status).toBe("VERIFIED_WORK");
    expect(verify(article(), undefined, { autoAdmit: false }).approval_origin).toBeNull();
  });
  it("can turn a bibliographic record into evidence through a licensed institutional copy of the same DOI", () => {
    const record = verify(article(false), "https://publisher.example/journals/vedic/article");
    const copy = verify(article(), "https://example.edu/repository/vedic/article");
    expect(record.verification_status).toBe("BIBLIOGRAPHIC_ONLY");
    expect(copy.verification_status).toBe("APPROVED_FOR_EVIDENCE");
    expect(copy.independent_work_key).toBe(record.independent_work_key);
  });
  it("rejects anonymous and low-quality platforms", () => {
    expect(verify("<html><body>Vishvamitra biography</body></html>").verification_status).toBe("REJECTED_UNVERIFIABLE");
    expect(verify(article(), "https://quora.com/project/vedic/article").verification_status).toBe("REJECTED_LOW_QUALITY");
  });
  it("requires explicit primary work, edition, and editor provenance", () => {
    const primary = article().replace('name="citation_doi"', 'name="citation_edition"')
      .replace('<meta name="citation_author"', '<meta name="citation_editor"')
      .replace('name="citation_journal_title"', 'name="citation_book_title"');
    const result = verify(primary);
    expect(result.verification_status).toBe("APPROVED_FOR_EVIDENCE");
    expect(result.source_type).toBe("primary_text");
    expect(result.edition).toBe("10.1234/example.2021.7");
  });
  it("admits a named public-domain translation with original script and exact verse locations", () => {
    const html = `<html><title>Maṇḍala 3 — Rigveda — Archive</title><body><main>
      <h1>Vishvamitra and Maṇḍala 3</h1><p>Translated by Ralph T. H. Griffith (1896, The Hymns of the Rigveda, public domain).</p>
      ${Array.from({ length: 30 }, (_, index) => `<p>${index + 1}.1 विश्वामित्रो देव । Original passage and translation of Vishvamitra.</p>`).join("")}
      </main></body></html>`;
    const result = verify(html, "https://new-archive.org/texts/rigveda/3");
    expect(result.verification_status).toBe("APPROVED_FOR_EVIDENCE");
    expect(result.source_type).toBe("primary_text");
    expect(result.translator).toBe("Ralph T. H. Griffith");
    expect(duplicateWorkOf(result, [{ canonical_url: "https://mirror.edu/rigveda/3", independent_work_key: result.independent_work_key }])).toBe("https://mirror.edu/rigveda/3");
    expect(duplicateWorkOf(result, [{ canonical_url: "https://mirror.edu/rigveda/3", independent_work_key: "another edition" }])).toBeNull();
  });
  it("promotes a three-page project only to its exact path and inherits institution only there", () => {
    const rows = ["one", "two", "three"].map((name) => verify(article(), `https://example.edu/project/vedic/${name}`));
    const scope = verifiedFamilyScope(rows);
    expect(scope).toEqual({ domain: "example.edu", path: "/project/vedic/" });
    const family = [{ domain: scope!.domain, path_prefix: scope!.path, institution: "Example University" }];
    expect(inheritedInstitutionForUrl("https://example.edu/project/vedic/four", family)).toBe("Example University");
    expect(inheritedInstitutionForUrl("https://example.edu/project/other/four", family)).toBeNull();
    expect(inheritedInstitutionForUrl("https://example.edu.attacker.test/project/vedic/four", family)).toBeNull();
    expect(verifiedFamilyScope(rows.slice(0, 2))).toBeNull();
    expect(verifiedFamilyScope([{ ...rows[0], institution: "Another University" }, ...rows.slice(1)])).toBeNull();
    const nested = ["one", "two", "three"].map((name) => verify(article(), `https://example.edu/project/vedic/edition/${name}`));
    expect(verifiedFamilyScope(nested)).toEqual({ domain: "example.edu", path: "/project/vedic/edition/" });
    expect(projectDescriptionEvidence("<body>Example University Vedic text project with editorial method and translation policy.</body>", "Example University")).toBe(true);
    expect(projectDescriptionEvidence("<body>Three Sanskrit pages with no project documentation.</body>", "Example University")).toBe(false);
    expect(projectDescriptionLinks('<a href="/about-project/">About Project</a><a href="https://evil.test/about">About</a>', "https://example.edu/project/vedic/"))
      .toEqual(["https://example.edu/about-project/"]);
  });
  it("finds only relevant same-project child links for separate verification", () => {
    const html = `<a href="/texts/rigveda/3/">Mandala 3 — hymns of Viśvāmitra</a>
      <a href="https://evil.test/texts/rigveda/3/">Viśvāmitra mirror</a>
      <a href="/unrelated/3/">Viśvāmitra discussion</a>`;
    expect(relevantChildLinks(html, "https://example.edu/texts/rigveda/", ["Viśvāmitra"])).toEqual(["https://example.edu/texts/rigveda/3/"]);
  });
});

describe("research depth and stop policy", () => {
  const base: DepthParameter = { code: "textual", name: "Textual contributions", fieldCount: 4, fieldsWithSourceChunks: 4,
    sourceChunks: 25, independentWorks: 1, primaryWorks: 0, scholarlyWorks: 1, approvedClaims: 4,
    claimsWithExactPassages: 0, textualLayers: 1 };
  it("does not call many copied chunks deep", () => {
    expect(evaluateDepth([base]).areas[0].state).toBe("THIN");
  });
  it("recalculates depth using independent works, evidence balance, and exact links", () => {
    const result = evaluateDepth([{ ...base, independentWorks: 4, primaryWorks: 2, scholarlyWorks: 2,
      claimsWithExactPassages: 4, textualLayers: 2 }]);
    expect(result.areas[0].state).toBe("DEEP");
    expect(result.sufficient).toBe(true);
  });
  it("stops for sufficiency, saturation, budget, and manual action", () => {
    const base = { sufficient: false, saturatedBatches: 0, searchCalls: 3, maxSearchRequests: 20, hasNextQuery: true };
    expect(adaptiveStopReason({ ...base, sufficient: true })).toBe("sufficient");
    expect(adaptiveStopReason({ ...base, saturatedBatches: 3 })).toBe("global_research_saturated");
    expect(adaptiveStopReason({ ...base, hasNextQuery: false })).toBe("search_strategy_saturated");
    expect(adaptiveStopReason({ ...base, searchCalls: 20 })).toBe("budget");
    expect(adaptiveStopReason({ ...base, manualStop: true })).toBe("manual_stop");
  });
});

describe("safe candidate preview", () => {
  it("revalidates redirect destinations before requesting them", async () => {
    const networkValidator = vi.fn(async (url: string) => {
      if (url.includes("127.0.0.1")) throw new Error("SSRF blocked");
      return new URL(url);
    });
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { Location: "https://127.0.0.1/metadata" } }));
    await expect(fetchDiscoveryPreview("https://example.edu/a", { fetchImpl: fetchImpl as typeof fetch, networkValidator })).rejects.toThrow("SSRF blocked");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(networkValidator).toHaveBeenCalledTimes(2);
  });
  it("reads only the bounded metadata prefix of oversized pages", async () => {
    const fetchImpl = vi.fn(async () => new Response("x".repeat(300_000), { headers: { "content-type": "text/html", "content-length": "300000" } }));
    const preview = await fetchDiscoveryPreview("https://example.edu/a", { fetchImpl: fetchImpl as typeof fetch, networkValidator: async (url) => new URL(url) });
    expect(preview.html.length).toBe(256 * 1024);
  });
});

it("preserves exact verse references when extracting structured primary pages", () => {
  const html = `<html><title>Book 3 — Rigveda</title><body><main><ol>${Array.from({ length: 12 }, (_, i) =>
    `<li><div><span>1.${i + 1}</span><p lang="sa">विश्वामित्रो देव</p></div><p>Named translation ${i + 1}</p></li>`).join("")}</ol></main></body></html>`;
  const sections = sectionsFromHtml(html, "https://archive.test/texts/rigveda/3/");
  expect(sections).toHaveLength(12);
  expect(sections[0].pageOrSection).toBe("3.1.1");
  expect(sections[0].text).toContain("Named translation 1");
});
