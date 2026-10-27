import { describe, expect, it, vi } from "vitest";
import { bestSupportingSentence, inspectSearchSource, readGroundedExcerpt, sourceAccess, verifyGroundedStatement } from "@/lib/live-research/search-credibility";

const state = vi.hoisted(() => ({ preview: vi.fn(), pdf: vi.fn() }));
vi.mock("@/lib/corpus/source-extract", () => ({ extractPdf: state.pdf }));
vi.mock("@/lib/live-research/live-fetch", () => ({ fetchDiscoveryPreview: state.preview }));
const policy = { mode: "credible_web" as const, rules: [] };

describe("original-page verification for Google support", () => {
  it("does not cite an adjacent sentence just because it mentions the selected person", () => {
    const context = "The Chhatrapati Shivaji Maharaj Museum has organized galleries. Chhatrapati Shivaji Maharaj appointed ministers to oversee revenue collection across his kingdom.";
    expect(bestSupportingSentence(context, "How did Chhatrapati Shivaji Maharaj govern his kingdom?",
      ["Chhatrapati Shivaji Maharaj"])).toContain("appointed ministers");
  });
  it("admits a finding present near the named person on the original page", async () => {
    state.preview.mockResolvedValueOnce({ status: 200, finalUrl: "https://valmikiramayan.net/episode", html: "<html><title>Ramayana</title><body>In the Ramayana, Vasistha is the royal priest and counselor of king Dasharatha and advises Rama.</body></html>" });
    expect(await verifyGroundedStatement({ url: "https://valmikiramayan.net/episode", domain: "valmikiramayan.net", title: "Ramayana", category: "primary" }, "Vasistha serves as royal priest and counsels Dasharatha", ["Vasistha"], policy)).toBe(true);
  });
  it("rejects an unrelated scholarly page despite a credible host", async () => {
    state.preview.mockResolvedValueOnce({ status: 200, finalUrl: "https://cambridge.org/unrelated", html: "<html><title>Meat eating among Brahmans</title><body>This academic study discusses ritual food practices and lineage in India.</body></html>" });
    expect(await verifyGroundedStatement({ url: "https://cambridge.org/unrelated", domain: "cambridge.org", title: "Cambridge", category: "scholarly" }, "Vasistha was the royal priest of Dasharatha", ["Vasistha"], policy)).toBe(false);
  });
  it("rejects a redirect to a blocked domain", async () => {
    state.preview.mockResolvedValueOnce({ status: 200, finalUrl: "https://blocked.org/page", html: "<body>Vasistha was the royal priest of Dasharatha in the Ramayana.</body>" });
    expect(await verifyGroundedStatement({ url: "https://allowed.org/page", domain: "allowed.org", title: "Source", category: "other" }, "Vasistha was the royal priest of Dasharatha", ["Vasistha"], { mode: "credible_web", rules: [{ id: "b", domain: "blocked.org", display_name: "Blocked", status: "blocked", category: "other", notes: "" }] })).toBe(false);
  });
});

describe("live source admission", () => {
  const source = (url: string) => ({ url, domain: new URL(url).hostname, title: "Source", category: "institutional" });

  it("admits a recognized publisher without requiring scholarly metadata on the page", async () => {
    state.preview.mockClear();
    expect(await inspectSearchSource("https://www.smithsonianmag.com/history/raman", policy)).toMatchObject({ domain: "www.smithsonianmag.com" });
    expect(await inspectSearchSource("https://www.mdpi.com/2077-1444/1/1", policy)).not.toBeNull();
    expect(state.preview).not.toHaveBeenCalled();
  });

  it("allows an unrecognized readable site as a general-web candidate", async () => {
    state.preview.mockResolvedValueOnce({ status: 200, finalUrl: "https://history-notes.example/raman", html: `<html><title>Raman</title><body>${"Raman studied light. ".repeat(100)}</body></html>` });
    expect(await inspectSearchSource("https://history-notes.example/raman", policy)).toMatchObject({ category: "general_web" });
  });

  it("rejects a low-quality publisher before reading it as an Ask candidate", async () => {
    const url = "https://en.wikipedia.org/wiki/C._V._Raman";
    state.preview.mockClear();
    expect(await inspectSearchSource(url, policy)).toBeNull();
    expect(state.preview).not.toHaveBeenCalled();
  });

  it("rejects a recognized publisher's page that does not support the statement", async () => {
    state.preview.mockResolvedValueOnce({ status: 200, finalUrl: "https://www.si.edu/unrelated", html: "<html><title>Museum hours</title><body>C. V. Raman is mentioned once in a list of visiting lecturers at the museum this season.</body></html>" });
    expect(await readGroundedExcerpt(source("https://www.si.edu/unrelated"), "Landsberg and Mandelstam observed combinational scattering in quartz crystals", ["C. V. Raman", "Raman"], policy)).toBeNull();
  });

  it("finds a dated scholarly assertion after the subject is identified earlier in the same paragraph", async () => {
    const url = "https://plato.stanford.edu/entries/shankara/";
    state.preview.mockResolvedValueOnce({ status: 200, finalUrl: url, html: `<html><title>Śaṅkara (Stanford Encyclopedia of Philosophy)</title><main><h2>1. Life and Works</h2><p>There are several different dates ascribed to Śaṅkara. Early scholars placed him from 788–820 CE. Nakamura (1983: 48–88) argues for an earlier date of 700–750 CE, and discusses the various dating theories at length.</p></main></html>` });
    const result = await readGroundedExcerpt(source(url), "What dates does Nakamura propose for Shankara? Shankara dating Nakamura 700 750", ["Shankara", "Sankara"], policy);
    expect(result).toMatchObject({ locator: "1. Life and Works", supportLevel: expect.stringMatching(/EXACT|STRONG/) });
    expect(result?.text).toContain("Nakamura");
    expect(result?.text).toContain("700–750 CE");
  });

  it("reads a directly relevant contemporaries passage without demanding the follow-up's framing words", async () => {
    const url = "https://www.isro.gov.in/history/space-programme";
    state.preview.mockResolvedValueOnce({ status: 200, finalUrl: url,
      html: "<html><title>Early space programme</title><main><p>A. P. J. Abdul Kalam worked with Vikram Sarabhai on India's space programme in the 1960s, developing launch capabilities.</p></main></html>" });
    const result = await readGroundedExcerpt(source(url),
      "Who else was doing similar work at the time? Follow-up to: What did A. P. J. Abdul Kalam do for India's space programme? About A. P. J. Abdul Kalam.",
      ["A. P. J. Abdul Kalam", "Abdul Kalam"], policy);
    expect(result).toMatchObject({ supportLevel: expect.stringMatching(/EXACT|STRONG/), identity: { provenanceComplete: false } });
    expect(result?.text).toContain("Vikram Sarabhai");
  });

  it("extracts a licensed, dated award passage with its institutional provenance", async () => {
    const url = "https://records.gov/awards/anika-sen";
    state.preview.mockResolvedValueOnce({ status: 200, finalUrl: url,
      html: `<html><head><title>Aurora Medal register</title><meta name="citation_title" content="Aurora Medal register" />
        <meta name="citation_author" content="Registrar" /><meta name="citation_publisher" content="National Records Office" />
        <link rel="license" href="https://creativecommons.org/licenses/by/4.0/" /></head>
        <main><h2>1928 award register</h2><p>Anika Sen was awarded the Aurora Medal in 1928 by the National Records Office.</p></main></html>` });
    const result = await readGroundedExcerpt(source(url), "When was Anika Sen awarded the Aurora Medal?", ["Anika Sen"], policy);
    expect(result).toMatchObject({ supportLevel: expect.stringMatching(/EXACT|STRONG/), locator: "1928 award register",
      rightsDeclaration: "https://creativecommons.org/licenses/by/4.0/",
      identity: { title: "Aurora Medal register", publisher: "National Records Office", provenanceComplete: true } });
    expect(result?.text).toContain("1928");
  });

  it("keeps the full dated support sentence when earlier context would fill the excerpt limit", async () => {
    const url = "https://records.gov/awards/raman-context";
    const lead = "Researchers examined the spectroscopy equipment and documented its calibration. ".repeat(8);
    state.preview.mockResolvedValueOnce({ status: 200, finalUrl: url,
      html: `<html><head><title>Raman award record</title></head><main><p>${lead}The Raman effect, discovered by Sir Chandrasekhara Venkata Raman in 1928, earned him the Nobel Prize in Physics in 1930.</p></main></html>` });
    const result = await readGroundedExcerpt(source(url), "In what year was C. V. Raman awarded the Nobel Prize in Physics?",
      ["C. V. Raman", "Chandrasekhara Venkata Raman"], policy);
    expect(result?.text).toContain("Nobel Prize in Physics in 1930");
    expect(result?.text?.length).toBeLessThanOrEqual(600);
  });

  it("recognizes a Creative Commons link in an article-specific rights statement", async () => {
    const url = "https://publisher.example/articles/raman";
    state.preview.mockResolvedValueOnce({ status: 200, finalUrl: url,
      html: `<html><head><title>Raman's award history</title><meta name="citation_title" content="Raman's award history" />
        <meta name="citation_author" content="Historian" /><meta name="citation_publisher" content="University Press" /></head>
        <body><div class="article-rights">This is an Open Access article, distributed under the terms of the Creative Commons Attribution licence
        (<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>).</div>
        <main><p>C. V. Raman was awarded the Nobel Prize in Physics in 1930.</p></main></body></html>` });
    const result = await readGroundedExcerpt(source(url), "In what year was C. V. Raman awarded the Nobel Prize in Physics?",
      ["C. V. Raman", "Raman"], policy);
    expect(result).toMatchObject({ rightsDeclaration: "https://creativecommons.org/licenses/by/4.0/",
      supportLevel: expect.stringMatching(/EXACT|STRONG/) });
  });

  it("does not borrow a subject from a preceding paragraph for an unrelated date", async () => {
    const url = "https://plato.stanford.edu/entries/unrelated-date/";
    state.preview.mockResolvedValueOnce({ status: 200, finalUrl: url, html: `<html><title>Śaṅkara (Stanford Encyclopedia of Philosophy)</title><main><p>Śaṅkara wrote commentaries on several texts.</p><p>Nakamura (1983) dates another philosopher's work to 700–750 CE.</p></main></html>` });
    expect(await readGroundedExcerpt(source(url), "What dates does Nakamura propose for Shankara? Shankara dating Nakamura 700 750", ["Shankara", "Sankara"], policy)).toBeNull();
  });

  it("reads evidence from a text PDF and keeps the page number", async () => {
    state.preview.mockResolvedValueOnce({ status: 200, finalUrl: "https://repository.ias.ac.in/raman.pdf", contentType: "application/pdf", html: "", pdf: new Uint8Array([0x25, 0x50, 0x44, 0x46]) });
    state.pdf.mockResolvedValueOnce([
      { title: "Page 1", pageOrSection: "p. 387", text: "Proceedings of the Indian Academy of Sciences." },
      { title: "Page 2", pageOrSection: "p. 388", text: "In 1928 Raman and Krishnan reported that scattered light contains\nradiation of altered wavelength, a new type of secondary radiation." },
    ]);
    const excerpt = await readGroundedExcerpt(source("https://repository.ias.ac.in/raman.pdf"), "Raman and Krishnan reported scattered radiation of altered wavelength in 1928", ["C. V. Raman", "Raman"], policy);
    expect(excerpt).toMatchObject({ locator: "p. 388", url: "https://repository.ias.ac.in/raman.pdf" });
    expect(excerpt?.text).toContain("altered wavelength");
  });

  it("does not admit a PDF with no text layer", async () => {
    state.preview.mockResolvedValueOnce({ status: 200, finalUrl: "https://repository.ias.ac.in/scan.pdf", contentType: "application/pdf", html: "", pdf: new Uint8Array([0x25, 0x50, 0x44, 0x46]) });
    state.pdf.mockRejectedValueOnce(new Error("no text"));
    expect(await readGroundedExcerpt(source("https://repository.ias.ac.in/scan.pdf"), "Raman reported scattered radiation of altered wavelength", ["Raman"], policy)).toBeNull();
    expect(await sourceAccess("https://repository.ias.ac.in/scan.pdf")).toBe("unreadable");
  });

  it("treats a site that refuses the request as a lead, never as evidence", async () => {
    state.preview.mockResolvedValueOnce({ status: 403, finalUrl: "https://www.britannica.com/science/Raman-effect", contentType: "text/html", html: "" });
    expect(await readGroundedExcerpt(source("https://www.britannica.com/science/Raman-effect"), "The Raman effect is a change in wavelength of scattered light", ["Raman"], policy)).toBeNull();
    expect(await sourceAccess("https://www.britannica.com/science/Raman-effect")).toBe("blocked");
    expect(state.preview.mock.calls.filter(([url]) => String(url).includes("britannica")).length).toBe(1);
  });

  it("respects a page rate limit without retrying or extracting evidence", async () => {
    const url = "https://records.example.edu/rate-limited-prism";
    state.preview.mockResolvedValueOnce({ status: 429, finalUrl: url, contentType: "text/html", html: "" });
    expect(await readGroundedExcerpt(source(url), "When did Anika Sen discover the prism effect?", ["Anika Sen"], policy)).toBeNull();
    expect(await sourceAccess(url)).toBe("blocked");
    expect(state.preview.mock.calls.filter(([candidate]) => candidate === url)).toHaveLength(1);
  });
  it("does not retain unlicensed page text in the in-memory source cache", async () => {
    const url = "https://records.example.edu/unlicensed-cache-fixture";
    state.preview.mockResolvedValue({ status: 200, finalUrl: url, contentType: "text/html",
      html: "<html><title>Register</title><main><p>The original register contains an unlicensed source passage.</p></main></html>" });
    expect(await sourceAccess(url)).toBe("readable");
    expect(await sourceAccess(url)).toBe("readable");
    expect(state.preview.mock.calls.filter(([candidate]) => candidate === url)).toHaveLength(2);
  });
});
