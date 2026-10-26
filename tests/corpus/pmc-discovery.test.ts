import { describe, expect, it, vi } from "vitest";
import { searchPmcArticles } from "@/lib/live-research/pmc-discovery";

const validate = async (value: string) => new URL(value);

describe("official PMC discovery", () => {
  it("uses a documented full-name alias and the question's named target", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ esearchresult: { idlist: ["4763617", "11505626", "10937994"] } }),
      { headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    const results = await searchPmcArticles("C. V. Raman", ["Chandrasekhara Venkata Raman", "Raman"],
      "In what year was C. V. Raman awarded the Nobel Prize in Physics?", fetchImpl, validate);
    expect(results.map((item) => item.url)).toEqual([
      "https://pmc.ncbi.nlm.nih.gov/articles/PMC4763617/",
      "https://pmc.ncbi.nlm.nih.gov/articles/PMC11505626/",
      "https://pmc.ncbi.nlm.nih.gov/articles/PMC10937994/",
    ]);
    const target = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0] as URL;
    expect(target.searchParams.get("term")).toBe('"chandrasekhara venkata raman" "Nobel Prize in Physics"');
    expect(target.searchParams.get("retmax")).toBe("4");
  });

  it("does not call PMC for an unrelated question or accept malformed IDs", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ esearchresult: { idlist: ["1", "../secret", "0"] } }),
      { headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    expect(await searchPmcArticles("Anika Sen", [], "Where was Anika Sen born?", fetchImpl, validate)).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await searchPmcArticles("Anika Sen", [], "What scientific discovery did Anika Sen make?", fetchImpl, validate))
      .toEqual([{ title: "PMC article 1", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC1/", sourceProvider: "pmc" }]);
  });
});
