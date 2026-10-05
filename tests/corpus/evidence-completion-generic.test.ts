import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CANONICAL_SCHEMES, citedVerseWindow, parseLocator } from "@/lib/evidence-completion/locator";
import { assessCitedPassage, excludedStems } from "@/lib/evidence-completion/passage-match";
import { classifyFailure, missingEvidenceItems, prioritizeLocations, sourceAvailability, type QueueSource } from "@/lib/evidence-completion/queue";
import { pageLabel, selectCitedPages } from "@/lib/evidence-completion/document-pages";
import { fetchCorpusDocument, mirrorIdentifier } from "@/lib/evidence-completion/documents";
import { fetchApprovedResource } from "@/lib/live-research/live-fetch";
import type { SourceAccessRule } from "@/lib/live-research/source-policy";

/** A non-Rishi fixture: a modern scientist whose claims cite a journal article by DOI and printed page. */
const scientist = { id: "fixture-scientist", aliases: ["Ada Example", "A. Example"] };
const article: QueueSource = { id: "article", title: "Journal of Fixture Physics, vol. 12: On Lattice Damping", url: "https://journal.example.org/articles/12/lattice.pdf",
  approved: true, ingestionStatus: "failed", lastError: "The approved source exceeds the 12 MB live-fetch limit.", workTitle: "Journal of Fixture Physics" };

describe("personality-independent operation (scientist fixture: DOI + printed page)", () => {
  const claims = [
    { id: "c1", text: "Ada Example measured lattice damping at liquid helium temperature in 1931.", certainty: "high", parameterFieldId: "f-contrib", support: "NONE" as const,
      citations: [{ claimSourceId: "cs1", sourceId: "article", locator: "p. 214", excerpt: null }] },
    { id: "c2", text: "Ada Example reported that damping fell sharply below the transition point.", certainty: "high", parameterFieldId: "f-contrib", support: "NONE" as const,
      citations: [{ claimSourceId: "cs2", sourceId: "article", locator: "pp. 214–215", excerpt: null }] },
    { id: "c3", text: "Reviewer remark about scope.", certainty: "medium", parameterFieldId: "f-contrib", support: "NONE" as const,
      citations: [{ claimSourceId: "cs3", sourceId: "article", locator: "Review rule", excerpt: null }] },
    { id: "c4", text: "The paper is registered under its DOI.", certainty: "medium", parameterFieldId: "f-contrib", support: "NONE" as const,
      citations: [{ claimSourceId: "cs4", sourceId: "article", locator: "https://doi.org/10.5555/fixture.1931.214", excerpt: null }] },
  ];

  it("queues the cited pages, groups claims sharing a page, and keeps reviewer notes out of acquisition", () => {
    const items = missingEvidenceItems({ personalityId: scientist.id, claims, sources: new Map([["article", article]]), fieldParameter: new Map([["f-contrib", "CONTRIBUTION"]]) });
    expect(items.map((item) => item.locator.kind)).toEqual(["page", "page", "note", "doi"]);
    expect(items[3].locator.key).toBe("doi:10.5555/fixture.1931.214");
    expect(sourceAvailability(article)).toBe("oversize");
    const locations = prioritizeLocations(items, new Map(), new Set());
    expect(locations.map((location) => location.key)).not.toContain(expect.stringContaining("note:"));
    expect(locations.find((location) => location.key.endsWith("page:214"))?.claims.map((claim) => claim.id)).toEqual(["c1"]);
  });

  it("plans page extraction from a large document and links the cited page EXACT without any tradition logic", () => {
    const pages = Array.from({ length: 400 }, (_, index) => ({ index: index + 11, printed: String(index + 1),
      text: index + 1 === 214 ? "Lattice damping was measured at liquid helium temperature during 1931 by A. Example; damping fell sharply below the transition point."
        : `Unrelated page ${index + 1} on instrument calibration.` }));
    const requested = parseLocator("p. 214");
    const selected = selectCitedPages(pages, { locator: requested, claimTexts: [claims[0].text], aliases: scientist.aliases, workTitle: article.workTitle });
    expect(selected).toHaveLength(1);
    expect(pageLabel(selected[0])).toBe("p. 214 (scan page 224)");
    const assessment = assessCitedPassage({ claimText: claims[0].text, requested, identity: "same_source",
      passage: { text: selected[0].text, locators: [parseLocator(pageLabel(selected[0]))] }, exclude: excludedStems(scientist.aliases, [article.workTitle]) });
    expect(assessment).toMatchObject({ level: "EXACT", locatorFit: "exact" });
    // The same page from a different edition is never EXACT: page numbers belong to one edition.
    expect(assessCitedPassage({ claimText: claims[0].text, requested, identity: "alternate_edition",
      passage: { text: selected[0].text, locators: [parseLocator("p. 214")] }, exclude: excludedStems(scientist.aliases, [article.workTitle]) }).level).toBe("STRONG");
  });
});

describe("configurable numbered traditions with inline markers (synthetic tradition)", () => {
  afterEach(() => { const index = CANONICAL_SCHEMES.findIndex((scheme) => scheme.scheme === "fixture-codex"); if (index >= 0) CANONICAL_SCHEMES.splice(index, 1); });

  it("lets a generic chapter chunk satisfy a verse citation through its inline markers", () => {
    CANONICAL_SCHEMES.push({ scheme: "fixture-codex", work: /fixture codex|scroll\b/i, maxBook: 12, books: [[/first scroll/i, 1]] });
    const requested = parseLocator("First Scroll 1.7.3-4", "Fixture Codex");
    expect(requested.key).toBe("fixture-codex:1.7.3-4");
    const chunk = "Introduction to the chapter. [1-7-1] The keeper opens the gate. [1-7-2] The keeper names the river and plants the cedar grove. [1-7-3, 4] The festival ends. [1-7-5]";
    expect(citedVerseWindow(chunk, requested)).toBe("The keeper names the river and plants the cedar grove. [1-7-3, 4]");
    const assessment = assessCitedPassage({ claimText: "The keeper names the river and plants the cedar grove.", requested, identity: "same_work",
      passage: { text: chunk, locators: [parseLocator("Fixture Codex, First Scroll, Chapter 7")] }, exclude: excludedStems(["The Keeper"], ["Fixture Codex"]) });
    expect(assessment).toMatchObject({ level: "EXACT", window: "cited_verses" });
  });
});

describe("access copies and edition distinction", () => {
  const page = { text: "Visvamitra adopted Sunahsepa as his son, naming him Devarata.", locators: [parseLocator("p. 470 (scan page 101)")] };
  const exclude = excludedStems(["Vishvamitra"], ["Aitareya Brahmana"]);
  const claim = "Vishvamitra adopted Shunahshepa as his son Devarata.";
  const requested = parseLocator("p. 470");

  it("keeps the cited document's page identity for a checksum-identical copy only", () => {
    expect(assessCitedPassage({ claimText: claim, requested, identity: "identical_document", passage: page, exclude }).level).toBe("EXACT");
    expect(assessCitedPassage({ claimText: claim, requested, identity: "same_catalogue_record", passage: page, exclude }).level).toBe("STRONG");
    expect(assessCitedPassage({ claimText: claim, requested, identity: "alternate_edition", passage: page, exclude }).level).toBe("STRONG");
  });

  it("derives the repository mirror identifier from the original URL, not from a site list", () => {
    expect(mirrorIdentifier("https://library.example.gov.in/scans/90210.pdf", "90210")).toBe("in.gov.example.library.90210");
    expect(mirrorIdentifier("https://library.example.org/a b.pdf", "a b")).toBeNull();
  });
});

describe("admin-only large documents", () => {
  it("refuses a document without an approved ingest rule before any download", async () => {
    await expect(fetchCorpusDocument("https://unapproved.example.org/huge.pdf", [])).rejects.toMatchObject({ code: "SOURCE_NOT_APPROVED" });
  });

  it("keeps the 12 MB limit on the normal live-fetch path used by Ask", async () => {
    const rule = { id: "r", display_name: "r", domain: "big.example.org", scope_type: "DOMAIN", allowed_path_prefix: null, exact_url: null, include_subdomains: false,
      allow_live_search: true, allow_live_fetch: true, allow_ingestion: true, evidence_use_status: "approved", priority: 1, default_textual_layer: null,
      default_source_type: null, cache_ttl_hours: 1, is_active: true } as SourceAccessRule;
    const fetchImpl = (async () => new Response("x", { status: 200, headers: { "content-type": "application/pdf", "content-length": String(30 * 1024 * 1024) } })) as typeof fetch;
    await expect(fetchApprovedResource("https://big.example.org/doc.pdf", { rules: [rule], fetchImpl, networkValidator: async (url) => new URL(url) }))
      .rejects.toMatchObject({ code: "CONTENT_TOO_LARGE" });
  });

  it("is never imported by Ask, retrieval, or answer code", () => {
    const roots = ["src/lib/ask", "src/app/api/ask", "src/lib/corpus", "src/lib/live-research", "src/app/ask"];
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      return statSync(full).isDirectory() ? walk(full) : /\.tsx?$/.test(name) ? [full] : [];
    });
    const files = roots.flatMap(walk);
    const offenders = files.filter((file) => /evidence-completion/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});

describe("failure classification", () => {
  it("reads network causes through the wrapper error", () => {
    const tls = new Error("The approved source could not be fetched.", { cause: Object.assign(new Error("fetch failed"), { cause: { code: "ERR_TLS_CERT_ALTNAME_INVALID" } }) });
    expect(classifyFailure(tls)).toBe("TLS_ERROR");
    expect(classifyFailure(new Error("The approved source returned HTTP 403."))).toBe("ACCESS_DENIED");
    expect(classifyFailure(new Error("The document exceeds the corpus document limit."))).toBe("DOCUMENT_TOO_LARGE");
  });
});
