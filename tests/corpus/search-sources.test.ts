import { describe, expect, it, vi } from "vitest";
import { normalizeSearchDomain, searchPolicyDecision, type SearchPolicy } from "@/lib/live-research/search-policy";
import { answerIntent, hasBroadAnswerEvidence, hasDirectLiveIdentity, prioritizeEvidence } from "@/lib/ask/evidence-priority";
import { fetchApprovedResource } from "@/lib/live-research/live-fetch";
import type { RetrievedPassage } from "@/lib/corpus/types";

const base: SearchPolicy = { mode: "credible_web", rules: [] };
const rule = (domain: string, status: "allowed" | "blocked" | "disabled") => ({ id: domain, domain, display_name: domain, status, category: "scholarly", notes: "" });

describe("Search Sources server policy", () => {
  it("discovers unknown HTTPS domains in credible-web mode and blocks explicit domains including subdomains", () => {
    expect(searchPolicyDecision("https://new-university.example/research", base)).toMatchObject({ allowed: true, reason: "CREDIBILITY_CHECK_REQUIRED" });
    const policy = { ...base, rules: [rule("example.org", "blocked")] };
    expect(searchPolicyDecision("https://sub.example.org/work", policy)).toMatchObject({ allowed: false, reason: "BLOCKED" });
    expect(searchPolicyDecision("https://notexample.org/work", policy).allowed).toBe(true);
  });
  it("enforces allowlist and temporary disablement", () => {
    const policy: SearchPolicy = { mode: "approved_domains_only", rules: [rule("cambridge.org", "allowed"), rule("archive.org", "disabled")] };
    expect(searchPolicyDecision("https://www.cambridge.org/book", policy).allowed).toBe(true);
    expect(searchPolicyDecision("https://new-source.edu/article", policy).reason).toBe("NOT_ON_ALLOWLIST");
    expect(searchPolicyDecision("https://archive.org/details/item", policy).reason).toBe("DISABLED");
    expect(searchPolicyDecision("http://cambridge.org/book", policy).allowed).toBe(false);
  });
  it("normalizes valid domains and rejects malformed input", () => {
    expect(normalizeSearchDomain("HTTPS://Cambridge.Org/path")).toBe("cambridge.org");
    expect(normalizeSearchDomain("example.org/article?section=2")).toBe("example.org");
    expect(() => normalizeSearchDomain("localhost")).toThrow();
    expect(() => normalizeSearchDomain("bad..domain.org")).toThrow();
    expect(() => normalizeSearchDomain("https://user:password@example.org/page")).toThrow();
  });
  it("checks every redirect before fetching a blocked destination", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://blocked.example.org/private" } }));
    const access = { id: "a", display_name: "Source", domain: "example.org", scope_type: "DOMAIN" as const, allowed_path_prefix: null, exact_url: null, include_subdomains: true, allow_live_search: true, allow_live_fetch: true, allow_ingestion: false, evidence_use_status: "approved" as const, priority: 1, default_textual_layer: null, default_source_type: null, cache_ttl_hours: 0, is_active: true };
    const policy: SearchPolicy = { ...base, rules: [rule("blocked.example.org", "blocked")] };
    await expect(fetchApprovedResource("https://example.org/start", { rules: [access], fetchImpl: fetcher as typeof fetch, networkValidator: async (url) => new URL(url), urlAllowed: (url) => searchPolicyDecision(url, policy).allowed })).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("focused evidence selection", () => {
  const passage = (id: string, text: string, origin?: "google_grounding"): RetrievedPassage => ({ kind: "passage", id, chunkId: id, sourceId: id, text, sectionTitle: null, pageOrSection: null, textualLayer: "Epic narrative", sourceTitle: id, sourceAuthor: null, sourceInstitution: null, sourceUrl: `https://${id}.example.org/page`, sourceType: "primary_text", sourceStatus: "approved", origin });
  it("changes the focus with the question and preserves a useful live finding", () => {
    const evidence = [passage("minor", "A minor metrical observation about the text."), passage("teaching", "The sage taught Rama the Bala and Atibala mantras."), passage("relationship", "Vishvamitra clashed with Vasistha over the wish-giving cow."), passage("live", "A scholarly source explains the transmission of divine weapons to Rama.", "google_grounding")];
    expect(answerIntent("What did Vishvamitra teach Rama?")).toBe("teaching");
    expect(answerIntent("What is Jamsetji Tata known for?")).toBe("importance");
    const chosen = prioritizeEvidence("What did Vishvamitra teach Rama?", evidence, 2);
    expect(chosen.map((item) => item.id)).toContain("teaching");
    expect(chosen.map((item) => item.id)).toContain("live");
    expect(chosen.map((item) => item.id)).not.toContain("minor");
  });
  it("permits a qualified identity answer from a verified live passage", () => {
    expect(hasDirectLiveIdentity("Who is Vasistha?", [passage("live", "Vasistha is the royal priest of King Dasharatha in the Ramayana.", "google_grounding")])).toBe(true);
    expect(hasDirectLiveIdentity("Why is Vasistha important?", [passage("live", "Vasistha is the royal priest of King Dasharatha in the Ramayana.", "google_grounding")])).toBe(false);
  });
  it("permits qualified broad synthesis from several grounded records but still rejects unsupported narrow facts", () => {
    const evidence = [
      passage("role", "Vishvamitra is presented as a Vedic seer associated with hymns."),
      passage("teacher", "The epic presents Vishvamitra as Rama's teacher and guide."),
    ];
    expect(hasBroadAnswerEvidence("What were Vishvamitra's most important works, teachings, and attributed traditions?", evidence)).toBe(true);
    expect(hasBroadAnswerEvidence("What were Rani Lakshmibai of Jhansi's most important political actions, institutions, and historical contributions?", evidence)).toBe(true);
    expect(hasBroadAnswerEvidence("What was Vishvamitra's favorite food?", evidence)).toBe(false);
  });
  it("prefers central roles over a one-off episode in a short biography", () => {
    const evidence = [
      passage("episode", "When a rejected king sought refuge, Vishvamitra summoned disciples for a ritual undertaking."),
      passage("role", "Vishvamitra is a sage and Vedic seer associated with hymns."),
      passage("teacher", "Vishvamitra is Rama's teacher and guide in the epic journey."),
    ];
    expect(prioritizeEvidence("Who is Vishvamitra?", evidence, 2).map((item) => item.id)).toEqual(["role", "teacher"]);
  });
});
