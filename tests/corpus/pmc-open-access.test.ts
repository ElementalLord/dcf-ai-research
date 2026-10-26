import { describe, expect, it, vi } from "vitest";
import { pmcArticleId, readPmcOpenArticle } from "@/lib/live-research/pmc-open-access";

const url = "https://pmc.ncbi.nlm.nih.gov/articles/PMC10649960/";
const xml = `<?xml version="1.0"?><OAI-PMH><GetRecord><record><metadata><article>
  <front><journal-meta><journal-title-group><journal-title>Nanomaterials</journal-title></journal-title-group>
    <publisher><publisher-name>Multidisciplinary Digital Publishing Institute</publisher-name></publisher></journal-meta>
  <article-meta><article-id pub-id-type="pmcid">PMC10649960</article-id>
    <article-id pub-id-type="doi">10.3390/nano13212843</article-id>
    <title-group><article-title>A study of Raman spectroscopy</article-title></title-group>
    <contrib-group><contrib contrib-type="author"><name><surname>Researcher</surname><given-names>A.</given-names></name></contrib></contrib-group>
    <pub-date pub-type="epub"><year>2023</year></pub-date>
    <permissions><license><ali:license_ref xmlns:ali="http://www.niso.org/schemas/ali/1.0/">https://creativecommons.org/licenses/by/4.0/</ali:license_ref></license></permissions>
  </article-meta></front><body><sec><title>Introduction</title><p>Chandrasekhara Venkata Raman was awarded the Nobel Prize in Physics in 1930.</p></sec></body>
</article></metadata></record></GetRecord></OAI-PMH>`;
const validate = async (value: string) => new URL(value);

describe("PMC's permitted full-text API", () => {
  it("accepts only canonical HTTPS PMC article paths", () => {
    expect(pmcArticleId(url)).toBe("PMC10649960");
    expect(pmcArticleId("https://evil.example/articles/PMC10649960/")).toBeNull();
    expect(pmcArticleId("https://pmc.ncbi.nlm.nih.gov/articles/PMC10649960/../../api/")).toBeNull();
  });

  it("reads the individual work, its explicit license, and supporting paragraph", async () => {
    const fetchImpl = vi.fn(async () => new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8" } })) as unknown as typeof fetch;
    const article = await readPmcOpenArticle(url, fetchImpl, validate);
    expect(article?.identity).toMatchObject({ doi: "10.3390/nano13212843", provenanceComplete: true, publisher: "Multidisciplinary Digital Publishing Institute" });
    expect(article?.rightsDeclaration).toBe("https://creativecommons.org/licenses/by/4.0/");
    expect(article?.sections).toContainEqual({ locator: "Introduction", text: "Chandrasekhara Venkata Raman was awarded the Nobel Prize in Physics in 1930." });
  });

  it("rejects a mismatched work and unavailable full text", async () => {
    const fetchImpl = vi.fn(async () => new Response(xml.replaceAll("PMC10649960", "PMC00000001"), { headers: { "content-type": "application/xml" } })) as unknown as typeof fetch;
    expect(await readPmcOpenArticle(url, fetchImpl, validate)).toBeNull();
    const unavailable = vi.fn(async () => new Response("", { status: 429 })) as unknown as typeof fetch;
    expect(await readPmcOpenArticle(url, unavailable, validate)).toBeNull();
  });
});
