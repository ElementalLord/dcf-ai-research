import { describe, expect, it } from "vitest";
import { robotsDecision } from "@/lib/live-research/on-demand-adapter";

describe("robots source access", () => {
  it("allows an article while excluding its export endpoint", () => {
    const rules = "User-agent: *\nDisallow: /\nAllow: /article/\nDisallow: /article/*.ris*\n";
    expect(robotsDecision(rules, "/article/10.1007/example")).toBe(true);
    expect(robotsDecision(rules, "/article/10.1007/example.ris")).toBe(false);
  });

  it("honors end anchors and a specific crawler group", () => {
    const rules = "User-agent: *\nDisallow: /\nUser-agent: dcf-ai-research\nAllow: /article$\nAllow: /article/\nDisallow: /private\n";
    expect(robotsDecision(rules, "/article")).toBe(true);
    expect(robotsDecision(rules, "/article/123")).toBe(true);
    expect(robotsDecision(rules, "/private/123")).toBe(false);
  });
});
