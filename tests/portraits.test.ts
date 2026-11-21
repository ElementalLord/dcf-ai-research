import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import snapshot from "../data/portrait-snapshot.json";

// Fresh module per test, so the ten-minute shared lookup doesn't leak between cases.
const load = async () => { vi.resetModules(); return import("@/lib/portraits"); };

describe("portraits", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout"] }));
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it("falls back to the saved snapshot when Wikipedia is unreachable", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetch);
    const { getPortraits } = await load();
    const pending = getPortraits(["subhas-chandra-bose", "srinivasa-ramanujan"]);
    await vi.runAllTimersAsync();
    const portraits = await pending;
    expect(portraits["subhas-chandra-bose"]).toEqual(snapshot["subhas-chandra-bose"]);
    expect(portraits["srinivasa-ramanujan"]).toEqual(snapshot["srinivasa-ramanujan"]);
    expect(fetch).toHaveBeenCalledTimes(2); // one retry, then the snapshot
  });

  it("asks Wikipedia once for the whole collection, whichever pages ask", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ query: { pages: [] } }) });
    vi.stubGlobal("fetch", fetch);
    const { getPortraits } = await load();
    await Promise.all([getPortraits(["ashoka"]), getPortraits(["c-v-raman", "guru-nanak"])]);
    const urls = new Set(fetch.mock.calls.map(([url]) => String(url)));
    expect(urls.size).toBe(1);
    expect(new URL([...urls][0]).searchParams.get("titles")?.split("|")).toHaveLength(25);
  });

  it("prefers a photo chosen in Resources, and skips the snapshot when the title was changed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const { getPortraits } = await load();
    const chosen = { src: "https://example.org/a.jpg", author: "DCF", license: "Used with permission", source: "https://example.org/a.jpg" };
    const pending = getPortraits(["ashoka", "c-v-raman"], { "c-v-raman": "Some Other Article" }, { ashoka: chosen });
    await vi.runAllTimersAsync();
    const portraits = await pending;
    expect(portraits.ashoka).toEqual(chosen);
    expect(portraits["c-v-raman"]).toBeUndefined();
  });
});
