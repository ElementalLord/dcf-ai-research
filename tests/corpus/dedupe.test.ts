import { describe, expect, it } from "vitest";
import { normalizedClaim, tokenJaccard } from "@/lib/corpus/dedupe";
import { normalizeSourceUrl } from "@/lib/corpus/source-dedupe";

describe("source and candidate deduplication", () => {
  it("normalizes equivalent source URLs to one identity", () => {
    expect(normalizeSourceUrl("HTTPS://Example.COM:443/path/?b=2&a=1#section")).toBe("https://example.com/path?a=1&b=2");
    expect(normalizeSourceUrl("https://example.com/path?a=1&b=2")).toBe("https://example.com/path?a=1&b=2");
  });

  it("detects exact and near-duplicate candidate claims", () => {
    expect(normalizedClaim("Vishvamitra—taught Rama.")).toBe(normalizedClaim("Vishvamitra taught Rama"));
    expect(tokenJaccard("Vishvamitra taught Rama the Bala teaching", "The Bala teaching was taught to Rama by Vishvamitra")).toBeGreaterThan(0.7);
  });
});
