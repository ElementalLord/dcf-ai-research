import { describe, expect, it } from "vitest";
import { verifyCandidate, type ArchiveItemRecord } from "@/lib/live-research/verification";
import { assessClaimPassage } from "@/lib/live-research/provenance-link";
import { evaluateDepth, type DepthParameter } from "@/lib/live-research/depth";
import { printedPageLabels } from "@/lib/corpus/source-extract";

const body = `<body><article><h1>Vishvamitra</h1><p>${"A detailed scholarly discussion of Vishvamitra and the textual record. ".repeat(30)}</p></article></body>`;
const page = (head: string) => `<html><head><title>Vishvamitra in Vedic Tradition</title>
  <meta name="citation_author" content="A. Scholar">
  <meta name="citation_journal_title" content="Journal of Vedic Studies">
  <meta name="citation_date" content="2021">
  <meta name="citation_doi" content="10.1234/example.2021.7">
  ${head}</head>${body}</html>`;
const verify = (html: string, url = "https://journal.example/articles/vedic/7", extra = {}) => verifyCandidate({
  candidateUrl: url, finalUrl: url, status: 200, contentType: "text/html", html,
  personalityAliases: ["Vishvamitra"], rules: [], autoAdmit: true, ...extra,
});
const archiveUrl = "https://archive.org/details/ancientindianhis00parguoft";
const archivePage = "<html><head><title>Ancient Indian historical tradition : Internet Archive</title></head><body>Free Download, Borrow, and Streaming</body></html>";
const archiveItem = (overrides: Partial<ArchiveItemRecord> = {}): ArchiveItemRecord => ({
  identifier: "ancientindianhis00parguoft", title: "Ancient Indian historical tradition", creator: "Pargiter, Frederick Eden",
  date: "1922", publisher: "London, Milford", contributor: "Robarts - University of Toronto", scanningCenter: "uoft",
  copyrightStatus: "NOT_IN_COPYRIGHT", licenseUrl: null, rights: null, nameMatches: 63, ...overrides,
});

describe("rights and access verification", () => {
  it("admits a source with an explicit open license", () => {
    const result = verify(page('<link rel="license" href="https://creativecommons.org/licenses/by/4.0/">'));
    expect(result.verification_status).toBe("APPROVED_FOR_EVIDENCE");
    expect(result.credibility_signals).toContain("Lawful access: explicit open license");
  });
  it("admits explicit public-domain metadata without any license string", () => {
    const result = verify(page('<meta name="dc.rights" content="Public domain">'));
    expect(result.verification_status).toBe("APPROVED_FOR_EVIDENCE");
    expect(result.credibility_signals).toContain("Lawful access: explicit public-domain or rights-clear metadata");
  });
  it("admits an original publisher's declared free full text", () => {
    const result = verify(page('<meta name="citation_fulltext_world_readable" content="yes">'));
    expect(result.verification_status).toBe("APPROVED_FOR_EVIDENCE");
  });
  it("keeps a credible DOI record without verifiable access bibliographic only", () => {
    const result = verify(page(""));
    expect(result.verification_status).toBe("BIBLIOGRAPHIC_ONLY");
    expect(result.approval_origin).toBeNull();
    expect(result.independent_work_key).toBe("10.1234/example.2021.7");
  });
  it("never treats archive.org hosting as rights evidence", () => {
    expect(verify(archivePage, archiveUrl).verification_status).not.toBe("APPROVED_FOR_EVIDENCE");
    const uncleared = verify(archivePage, archiveUrl, { archiveItem: archiveItem({ copyrightStatus: null }) });
    expect(uncleared.verification_status).toBe("BIBLIOGRAPHIC_ONLY");
    expect(uncleared.credibility_failures).toContain("Archive item lacks verifiable rights or scan provenance");
    const unprovenanced = verify(archivePage, archiveUrl, { archiveItem: archiveItem({ contributor: null, scanningCenter: null }) });
    expect(unprovenanced.verification_status).not.toBe("APPROVED_FOR_EVIDENCE");
    expect(unprovenanced.verification_status).not.toBe("VERIFIED_WORK");
  });
  it("verifies an identified rights-clear scan without auto-ingesting its viewer page", () => {
    const result = verify(archivePage, archiveUrl, { archiveItem: archiveItem() });
    expect(result.verification_status).toBe("VERIFIED_WORK");
    expect(result.author).toBe("Pargiter, Frederick Eden");
    expect(result.approval_origin).toBeNull();
    expect(verify(archivePage, archiveUrl, { archiveItem: archiveItem({ nameMatches: 0 }) }).verification_status).toBe("REJECTED_UNVERIFIABLE");
    expect(verify(archivePage, archiveUrl, { archiveItem: archiveItem({ identifier: "another-item" }) }).verification_status).not.toBe("VERIFIED_WORK");
  });
});

describe("exact provenance", () => {
  const claim = { text: "Vishvamitra gives the entire prepared meal to the disguised supplicant and keeps silence", locator: "1.65.6", work: "Valmiki Ramayana" };
  const verse = { text: "Vishvamitra gave the entire prepared meal to the supplicant and, keeping his vow of silence, said nothing.", locator: "1.65.6", work: "Valmiki Ramayana" };
  it("requires a stable locator at least as specific as the citation", () => {
    expect(assessClaimPassage(claim, verse, ["Vishvamitra"]).level).toBe("EXACT");
    expect(assessClaimPassage(claim, { ...verse, locator: null, work: null }, ["Vishvamitra"]).level).not.toBe("EXACT");
    expect(assessClaimPassage(claim, { ...verse, locator: "Introduction", work: "Valmiki Ramayana, Bala Kanda, Sarga 65" }, ["Vishvamitra"]).level).not.toBe("EXACT");
  });
  it("matches printed pages only within the cited source", () => {
    const cited = { text: "Sathaye reads the cow legend as shaped by the ahimsa debate", locator: "p. 56 (PDF page 16)", sourceId: "a" };
    const passage = { text: "the cow legend appears clearly shaped by the ahimsa debate of the period", locator: "p. 56 (PDF page 16)", sourceId: "a" };
    expect(assessClaimPassage(cited, passage).level).toBe("EXACT");
    expect(assessClaimPassage(cited, { ...passage, sourceId: "b" }).level).not.toBe("EXACT");
    expect(assessClaimPassage({ ...cited, locator: "Page 16" }, { ...passage, locator: "Page 16" }).level).not.toBe("EXACT");
  });
  it("does not promote a strong interpretive match to exact", () => {
    const interpretive = { ...claim, text: `${claim.text}; this should be read as hospitality rather than miracle` };
    expect(assessClaimPassage(interpretive, verse, ["Vishvamitra"]).level).toBe("STRONG");
  });
  it("derives printed page labels only from a consistent page offset", () => {
    const pages = Array.from({ length: 6 }, (_, index) => ({ num: index + 1, text: `${index + 41} body text of the article` }));
    expect(printedPageLabels(pages).get(2)).toBe("p. 42 (PDF page 2)");
    expect(printedPageLabels(pages.map((item, index) => ({ ...item, text: `${index * 7} noise` }))).size).toBe(0);
  });
});

describe("parameter depth", () => {
  const area = (overrides: Partial<DepthParameter>): DepthParameter => ({
    code: "historical_context", name: "Historical and Textual Context", fieldCount: 4, fieldsWithSourceChunks: 4, sourceChunks: 20,
    independentWorks: 5, primaryWorks: 2, scholarlyWorks: 3, approvedClaims: 20, claimsWithExactPassages: 12, textualLayers: 3,
    claimsWithStrongSupport: 18, coreClaims: 10, coreClaimsWithExactPassages: 8, ...overrides,
  });
  it("lets well-supported core claims reach GOOD below 70% overall exact coverage", () => {
    expect(evaluateDepth([area({})]).areas[0].state).toBe("GOOD");
  });
  it("still requires exact support for core claims", () => {
    const result = evaluateDepth([area({ coreClaimsWithExactPassages: 5 })]).areas[0];
    expect(result.state).toBe("BASIC");
    expect(result.reasons).toContain("Core claims lack exact passage links");
  });
  it("does not let a high strong-link count substitute for exact provenance", () => {
    expect(evaluateDepth([area({ claimsWithExactPassages: 6, claimsWithStrongSupport: 20, coreClaimsWithExactPassages: 6 })]).areas[0].state).toBe("BASIC");
    expect(evaluateDepth([area({ claimsWithStrongSupport: 12 })]).areas[0].state).toBe("BASIC");
  });
  it("keeps thin source diversity below GOOD regardless of links", () => {
    expect(evaluateDepth([area({ independentWorks: 2, claimsWithExactPassages: 20, coreClaimsWithExactPassages: 10 })]).areas[0].state).toBe("BASIC");
  });
});
