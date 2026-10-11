import { describe, expect, it, vi } from "vitest";
import { inspectSearchSource, readGroundedExcerpt, sourceAccess, verifyGroundedStatement } from "@/lib/live-research/search-credibility";

const state = vi.hoisted(() => ({ preview: vi.fn(), pdf: vi.fn() }));
vi.mock("@/lib/corpus/source-extract", () => ({ extractPdf: state.pdf }));
vi.mock("@/lib/live-research/live-fetch", () => ({ fetchDiscoveryPreview: state.preview }));
const policy = { mode: "credible_web" as const, rules: [] };

describe("original-page verification for Google support", () => {
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

  it("still rejects an unrecognized site that does not identify its publisher", async () => {
    state.preview.mockResolvedValueOnce({ status: 200, finalUrl: "https://history-notes.example/raman", html: `<html><title>Raman</title><body>${"Raman studied light. ".repeat(100)}</body></html>` });
    expect(await inspectSearchSource("https://history-notes.example/raman", policy)).toBeNull();
  });

  it("rejects a recognized publisher's page that does not support the statement", async () => {
    state.preview.mockResolvedValueOnce({ status: 200, finalUrl: "https://www.si.edu/unrelated", html: "<html><title>Museum hours</title><body>C. V. Raman is mentioned once in a list of visiting lecturers at the museum this season.</body></html>" });
    expect(await readGroundedExcerpt(source("https://www.si.edu/unrelated"), "Landsberg and Mandelstam observed combinational scattering in quartz crystals", ["C. V. Raman", "Raman"], policy)).toBeNull();
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
});
