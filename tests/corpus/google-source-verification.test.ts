import { describe, expect, it, vi } from "vitest";
import { verifyGroundedStatement } from "@/lib/live-research/search-credibility";

const state = vi.hoisted(() => ({ preview: vi.fn() }));
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
