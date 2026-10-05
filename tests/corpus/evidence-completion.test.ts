import { describe, expect, it } from "vitest";
import { citedVerseWindow, locatorCovers, parseLocator } from "@/lib/evidence-completion/locator";
import { assessCitedPassage, excludedStems, matchedWords, stems, termForms } from "@/lib/evidence-completion/passage-match";
import { missingEvidenceItems, prioritizeLocations, sourceAvailability, workTitleOf, type QueueSource } from "@/lib/evidence-completion/queue";
import { djvuXmlPages, printedPageMap, selectCitedPages } from "@/lib/evidence-completion/document-pages";
import { inferLocatorTemplates, sameWorkTitle, siblingPageConfirmed, siblingUrl } from "@/lib/evidence-completion/alternate";

describe("citation locators", () => {
  it("normalizes canonical, page, DOI, section, and reviewer-note locators across traditions", () => {
    expect(parseLocator("1.65", "Valmiki Ramayanam, Bala Kanda, Sarga 65").key).toBe("ramayana:1.65");
    expect(parseLocator("Bala Kanda 1.64.14–18").key).toBe("ramayana:1.64.14-18");
    expect(parseLocator("Kanda 1 Sarga 64").key).toBe("ramayana:1.64");
    expect(parseLocator("RV 3.33.9-13").key).toBe("rv:3.33.9-13");
    expect(parseLocator("Mandala 3, Sukta 33").key).toBe("rv:3.33");
    expect(parseLocator("Rigveda 3.33").key).toBe("rv:3.33");
    expect(parseLocator("Ṛgveda 3.33").key).toBe("rv:3.33");
    expect(parseLocator("3.33.1", "Rigveda, Mandala 3").key).toBe("rv:3.33.1");
    expect(parseLocator("12.142.93-96", "Mahabharata (Gita Press edition), Shanti Parva, Adhyaya 142").key).toBe("mahabharata:12.142.93-96");
    expect(parseLocator("pp. 51–53").key).toBe("page:51-53");
    expect(parseLocator("page 51").key).toBe("page:51");
    expect(parseLocator("doi:10.1017/S0035869X00011461").kind).toBe("doi");
    expect(parseLocator("Aitareya Brahmana Shunahshepa cycle")).toMatchObject({ kind: "section", specific: true });
    expect(parseLocator("Methodological note")).toMatchObject({ kind: "note", specific: false });
    expect(parseLocator("Review rule").specific).toBe(false);
  });

  it("treats a verse citation as covered by an overlapping verse passage and contained by its chapter", () => {
    const cited = parseLocator("1.65.1-3", "Valmiki Ramayana");
    expect(locatorCovers(cited, parseLocator("Bala Kanda, Sarga 65"))).toBe("containing");
    expect(locatorCovers(cited, parseLocator("1.65.2", "Ramayana"))).toBe("exact");
    expect(locatorCovers(cited, parseLocator("1.66", "Ramayana"))).toBe("none");
    expect(locatorCovers(parseLocator("p. 51"), parseLocator("p. 51 (scan page 70)"))).toBe("exact");
  });

  it("cuts the cited verses out of a chapter-sized passage using inline verse markers", () => {
    const text = "Opening of the chapter. [1-65-1] The sage resolved on silence and held his breath for a thousand years. [1-65-2, 3] Later events. [1-65-4]";
    const window = citedVerseWindow(text, parseLocator("1.65.2-3", "Ramayana"));
    expect(window).toContain("thousand years");
    expect(window).not.toContain("Opening");
    expect(window).not.toContain("Later events");
    expect(citedVerseWindow("Verse fifteen and sixteen. [1-65-15b, 16a] Next. [1-65-17]", parseLocator("1.65.16", "Ramayana"))).toBe("Verse fifteen and sixteen. [1-65-15b, 16a]");
  });
});

describe("missing-evidence queue", () => {
  const sources = new Map<string, QueueSource>([
    ["s1", { id: "s1", title: "Work X, Chapter 7", url: "https://repo.example/x/7", approved: true, ingestionStatus: "failed", lastError: "The approved source returned HTTP 403.", workTitle: "Work X" }],
    ["s2", { id: "s2", title: "Journal Y", url: "https://doi.example/y", approved: true, ingestionStatus: "ready", lastError: null, workTitle: "Journal Y" }],
  ]);

  it("classifies source availability from stored state alone", () => {
    expect(sourceAvailability(sources.get("s1"))).toBe("restricted");
    expect(sourceAvailability({ ...sources.get("s1")!, lastError: "The approved source exceeds the 12 MB live-fetch limit." })).toBe("oversize");
    expect(sourceAvailability({ ...sources.get("s1")!, lastError: "The approved source could not be fetched." })).toBe("unreachable");
    expect(sourceAvailability(sources.get("s2"))).toBe("stored");
  });

  it("groups claims by requested passage and ranks shared core passages first, for any personality", () => {
    const claim = (id: string, certainty: string, sourceId: string, locator: string) => ({ id, text: `Claim ${id}`, certainty, parameterFieldId: "f1", support: "NONE" as const,
      citations: [{ claimSourceId: `cs-${id}`, sourceId, locator, excerpt: null }] });
    const items = missingEvidenceItems({ personalityId: "p", sources, fieldParameter: new Map([["f1", "SOCIAL_ROLE"]]), claims: [
      claim("a", "high", "s2", "p. 214"), claim("b", "high", "s2", "pp. 214-215"), claim("c", "high", "s2", "p. 214"),
      claim("d", "medium", "s1", "Methodological note"), claim("e", "medium", "s1", "Section on the river crossing"),
    ] });
    const locations = prioritizeLocations(items, new Map([["f1", { fieldId: "f1", parameterCode: "SOCIAL_ROLE", state: "BASIC", closeToGood: true }]]), new Set());
    expect(locations[0]).toMatchObject({ key: "journal y|page:214", claims: [{ id: "a" }, { id: "c" }] });
    expect(locations.some((location) => location.locator.kind === "note")).toBe(false);
    expect(locations.find((location) => location.locator.kind === "section")?.availability).toEqual(["restricted"]);
  });

  it("does not queue a heading that only repeats the cited work's title", () => {
    const items = missingEvidenceItems({ personalityId: "p", fieldParameter: new Map(), sources: new Map([["s3", { id: "s3", title: "The Baudhayana Srauta-Sutra, Volume I", url: null, approved: true, ingestionStatus: "failed", lastError: null, workTitle: "The Baudhayana Srauta-Sutra" }]]),
      claims: [{ id: "z", text: "x", certainty: "high", parameterFieldId: null, support: "NONE", citations: [{ claimSourceId: "cz", sourceId: "s3", locator: "Baudhayana Srauta Sutra", excerpt: null }] }] });
    expect(items[0].locator.specific).toBe(false);
  });

  it("reads the work from metadata before falling back to the title stem", () => {
    expect(workTitleOf({ title: "Maṇḍala 3 — 62 hymns", metadata: { underlyingWork: "Rigveda, Mandala 3" } })).toBe("Rigveda, Mandala 3");
    expect(workTitleOf({ title: "Mahabharata (BORI Critical Edition), Udyoga Parva" })).toBe("Mahabharata");
  });
});

describe("citation-first linking", () => {
  const exclude = excludedStems(["Vishvamitra", "Viswamitra"], ["Valmiki Ramayana"]);
  const sarga = { text: "Then Vishvamitra undertook a vow of silence and severe ascesis, controlling his breath for a thousand years. [1-65-1, 2] The gods were perturbed. [1-65-3]",
    locators: [parseLocator("Valmiki Ramayana, Bala Kanda, Sarga 65")] };

  it("grants EXACT only for cited identity, cited locator, and the claim's own wording", () => {
    const exact = assessCitedPassage({ claimText: "Vishvamitra undertook a vow of silence and severe ascesis.", requested: parseLocator("1.65.1-2", "Ramayana"), identity: "same_work", passage: sarga, exclude });
    expect(exact).toMatchObject({ level: "EXACT", window: "cited_verses" });
    const wrongPlace = assessCitedPassage({ claimText: "Vishvamitra undertook a vow of silence and severe ascesis.", requested: parseLocator("1.66.1", "Ramayana"), identity: "same_work", passage: sarga, exclude });
    expect(wrongPlace.level).toBe("RELATED");
  });

  it("never makes an interpretive claim EXACT, and caps alternate editions at STRONG", () => {
    const interpretive = assessCitedPassage({ claimText: "The vow of silence and severe ascesis should be read as symbolic.", requested: parseLocator("1.65.1-2", "Ramayana"), identity: "same_work", passage: sarga, exclude });
    expect(interpretive.level).toBe("STRONG");
    const page = { text: "Visvamitra adopted Sunahsepa as his son, naming him Devarata, and his sons resisted.", locators: [parseLocator("p. 470")] };
    const alternate = assessCitedPassage({ claimText: "Vishvamitra adopted Shunahshepa as his son Devarata.", requested: parseLocator("Aitareya Brahmana Devarata section"), identity: "alternate_edition", passage: page, exclude });
    expect(alternate.level).toBe("STRONG");
    const identical = assessCitedPassage({ claimText: "Vishvamitra adopted Shunahshepa as his son Devarata.", requested: parseLocator("Aitareya Brahmana Devarata section"), identity: "identical_document", passage: page, exclude: excludedStems(["Vishvamitra"], ["Aitareya Brahmana"]) });
    expect(identical.level).toBe("EXACT");
  });

  it("meets plural and tense forms of the same word but adds no synonyms", () => {
    const passage = stems("the wagon would cross the river; a new creation");
    expect(matchedWords(termForms("wagons crossed rivers creating"), passage)).toHaveLength(4);
    expect(stems("withdrawal").has([...stems("annulment")][0])).toBe(false);
    expect([...stems("with which away even though over")]).toEqual([]);
  });

  it("does not grant EXACT when only names and places carry the match", () => {
    const passage = { text: "Rama and Lakshmana reached the hermitage of Gautama, where Ahalya was restored and reunited with Gautama.", locators: [parseLocator("Bala Kanda, Sarga 49")] };
    const result = assessCitedPassage({ claimText: "Vishvamitra directly stages Rama's entry into the Ahalya-Gautama episode at the hermitage of Gautama.",
      requested: parseLocator("1.49", "Ramayana"), identity: "same_work", passage, exclude });
    expect(result.level).not.toBe("EXACT");
  });

  it("does not count personality names or vocabulary overlap as support", () => {
    const thin = assessCitedPassage({ claimText: "Vishvamitra taught Rama the withdrawal of astras.", requested: parseLocator("1.65", "Ramayana"), identity: "same_work", passage: sarga, exclude });
    expect(thin.level).not.toBe("EXACT");
  });
});

describe("large documents and scans", () => {
  it("parses DjVu XML into scan pages with repository printed page numbers", () => {
    const xml = `<DjVuXML><BODY><OBJECT usemap="a_0000.djvu"></OBJECT><OBJECT usemap="a_0001.djvu"><HIDDENTEXT><PAGECOLUMN><REGION><PARAGRAPH><LINE><WORD coords="1">Sunahsepa</WORD><WORD coords="2">is</WORD></LINE><LINE><WORD>released &amp; adopted.</WORD></LINE></PARAGRAPH></REGION></PAGECOLUMN></HIDDENTEXT></OBJECT></BODY></DjVuXML>`;
    const pages = djvuXmlPages(xml, printedPageMap({ confidence: 90, pages: [{ leafNum: 1, pageNumber: "470" }] }));
    expect(pages[1]).toEqual({ index: 2, printed: "470", text: "Sunahsepa is\nreleased & adopted." });
    expect(printedPageMap({ confidence: 20, pages: [{ leafNum: 1, pageNumber: "470" }] }).size).toBe(0);
  });

  it("finds a cited episode name through OCR noise without loosening support wording", () => {
    const pages = [{ index: 1, printed: "88", text: "Preface." }, { index: 2, printed: "89", text: "The story of Sunahscpa, son of Ajigarta, bound to the stake." }];
    expect(selectCitedPages(pages, { locator: parseLocator("Aitareya Brahmana Shunahshepa cycle"), claimTexts: [], aliases: [], workTitle: "Aitareya Brahmana" })
      .map((page) => page.printed)).toEqual(["89"]);
    expect(stems("Sunahscpa").has([...stems("Shunahshepa")][0])).toBe(false);
  });

  it("selects only the pages that answer a citation", () => {
    const pages = [
      { index: 1, printed: "1", text: "Preface on the Aitareya Brahmana manuscripts." },
      { index: 2, printed: "470", text: "Sunahsepa is released. Visvamitra adopts him as his son Devarata." },
      { index: 3, printed: "471", text: "Further rites of the royal inauguration." },
    ];
    const selected = selectCitedPages(pages, { locator: parseLocator("Aitareya Brahmana Devarata section"), claimTexts: ["Vishvamitra adopted Shunahshepa as Devarata."], aliases: ["Vishvamitra"], workTitle: "Aitareya Brahmana" });
    // The heading page and the pages that continue its section, never the unrelated preface.
    expect(selected.map((page) => page.printed)).toEqual(["470", "471"]);
    expect(selectCitedPages(pages, { locator: parseLocator("pp. 470-471"), claimTexts: [], aliases: [], workTitle: "X" }).map((page) => page.printed)).toEqual(["470", "471"]);
  });
});

describe("alternate access copies", () => {
  const examples = [20, 21, 28, 34].map((chapter) => ({ url: `https://www.repo.example/utf8/baala/sarga${chapter}/bala_${chapter}_prose.htm`, locator: parseLocator(`Valmiki Ramayana — Bala Kanda, Sarga ${chapter} (prose)`) }));

  it("infers a repository's locator template from stored pages of the same work and book", () => {
    const templates = inferLocatorTemplates(examples);
    expect(templates[0]).toMatchObject({ scheme: "ramayana", book: 1, examples: 4 });
    expect(siblingUrl(templates, parseLocator("1.49", "Ramayana"))[0].url).toBe("https://www.repo.example/utf8/baala/sarga49/bala_49_prose.htm");
    expect(siblingUrl(templates, parseLocator("2.49", "Ramayana"))).toEqual([]);
    expect(siblingUrl(templates, parseLocator("1.49", "Ramayana"), ["repo.example"])).toEqual([]);
    expect(inferLocatorTemplates(examples.slice(0, 2))).toEqual([]);
  });

  it("requires a fetched sibling page to name its chapter and the personality", () => {
    const requested = parseLocator("1.49", "Ramayana");
    expect(siblingPageConfirmed("Bala Kanda Sarga 49 in Prose. Vishvamitra speaks. [1-49-1]", requested, ["Vishvamitra"])).toBe(true);
    expect(siblingPageConfirmed("Bala Kanda Sarga 50 in Prose. Vishvamitra speaks.", requested, ["Vishvamitra"])).toBe(false);
  });

  it("matches catalogue titles to the cited work, not to any record", () => {
    expect(sameWorkTitle("Aitareya Brahmana of the Rigveda vol.2", "Aitareya Brahmana")).toBe(true);
    expect(sameWorkTitle("Ancient and mediaeval India vol.1", "Aitareya Brahmana")).toBe(false);
  });
});
