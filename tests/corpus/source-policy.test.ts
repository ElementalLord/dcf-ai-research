import { describe, expect, it } from "vitest";
import { CorpusError } from "@/lib/corpus/errors";
import { assertRedirectApproved, assertUrlApprovedForResearch, canonicalResearchUrl, selectSourceAuthorization, type SourceAccessRule } from "@/lib/live-research/source-policy";
import { isPrivateIp } from "@/lib/corpus/security";
import { fetchApprovedResource } from "@/lib/live-research/live-fetch";

const domainRule: SourceAccessRule = {
  id: "domain", display_name: "Approved", domain: "approved-source.org", scope_type: "DOMAIN",
  allowed_path_prefix: null, exact_url: null, include_subdomains: false,
  allow_live_search: true, allow_live_fetch: true, allow_ingestion: false,
  evidence_use_status: "approved", priority: 100, default_textual_layer: null,
  default_source_type: null, cache_ttl_hours: 24, is_active: true,
};

describe("approved source firewall", () => {
  it("allows an approved domain but blocks unrelated and deceptive hosts", () => {
    expect(assertUrlApprovedForResearch("https://approved-source.org/page", [domainRule], "fetch", true).id).toBe("domain");
    expect(selectSourceAuthorization("https://randomsite.com", [domainRule], "fetch", true)).toBeNull();
    expect(selectSourceAuthorization("https://approved-source.org.attacker.com/page", [domainRule], "fetch", true)).toBeNull();
    expect(selectSourceAuthorization("https://attacker.com/?url=approved-source.org", [domainRule], "fetch", true)).toBeNull();
  });

  it("requires explicit subdomain approval and enforces path boundaries", () => {
    const pathRule = { ...domainRule, id: "path", scope_type: "PATH_PREFIX" as const, allowed_path_prefix: "/sanskrit/" };
    expect(selectSourceAuthorization("https://sub.approved-source.org/sanskrit/a", [pathRule], "fetch", true)).toBeNull();
    expect(selectSourceAuthorization("https://approved-source.org/sanskrit/a", [pathRule], "fetch", true)?.id).toBe("path");
    expect(selectSourceAuthorization("https://approved-source.org/sanskrit-attacker/a", [pathRule], "fetch", true)).toBeNull();
  });

  it("lets a narrower rule deny access that a broad domain would otherwise allow", () => {
    const deniedExact = { ...domainRule, id: "exact", scope_type: "EXACT_URL" as const, exact_url: "https://approved-source.org/restricted", allow_live_fetch: false };
    expect(selectSourceAuthorization("https://approved-source.org/restricted", [domainRule, deniedExact], "fetch", true)).toBeNull();
    expect(selectSourceAuthorization("https://approved-source.org/other", [domainRule, deniedExact], "fetch", true)?.id).toBe("domain");
  });

  it("normalizes fragments and default ports without discarding exact query constraints", () => {
    expect(canonicalResearchUrl("https://APPROVED-source.org:443/page#fragment")).toBe("https://approved-source.org/page");
    const exact = { ...domainRule, scope_type: "EXACT_URL" as const, exact_url: "https://approved-source.org/page?edition=1" };
    expect(selectSourceAuthorization("https://approved-source.org/page?edition=1#x", [exact], "fetch", true)).not.toBeNull();
    expect(selectSourceAuthorization("https://approved-source.org/page?edition=2", [exact], "fetch", true)).toBeNull();
  });

  it("rejects a redirect to an unapproved destination", () => {
    expect(() => assertRedirectApproved("https://unapproved-site.com/page", [domainRule])).toThrowError(CorpusError);
    try { assertRedirectApproved("https://unapproved-site.com/page", [domainRule]); } catch (error) {
      expect((error as CorpusError).code).toBe("REDIRECT_NOT_APPROVED");
    }
  });

  it("revalidates redirects inside the network fetch loop", async () => {
    const fetchImpl = async () => new Response(null, { status: 302, headers: { location: "https://unapproved-site.com/page" } });
    await expect(fetchApprovedResource("https://approved-source.org/start", {
      rules: [domainRule], fetchImpl: fetchImpl as typeof fetch,
      networkValidator: async (url) => new URL(url),
    })).rejects.toMatchObject({ code: "REDIRECT_NOT_APPROVED" });
  });

  it("identifies private, loopback, link-local, and private IPv6 addresses", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("192.168.1.10")).toBe(true);
    expect(isPrivateIp("169.254.169.254")).toBe(true);
    expect(isPrivateIp("10.0.0.1")).toBe(true);
    expect(isPrivateIp("::1")).toBe(true);
    expect(isPrivateIp("fd00::1")).toBe(true);
    expect(isPrivateIp("8.8.8.8")).toBe(false);
  });

  it("rejects unsafe schemes and user-info tricks", () => {
    expect(() => assertUrlApprovedForResearch("file:///etc/passwd", [domainRule], "fetch")).toThrow();
    expect(() => assertUrlApprovedForResearch("https://approved-source.org@attacker.com/page", [domainRule], "fetch")).toThrow();
    expect(() => canonicalResearchUrl("https://approved-source.org/a/%252e%252e/secret")).toThrow();
    expect(() => canonicalResearchUrl("https://approved-source.org/a/../secret")).toThrow();
  });
});
