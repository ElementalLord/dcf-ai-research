import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { rpc } }));
import { ApiLimitError, publicRateLimit, withProviderQuota } from "@/lib/api-rate-limit";

const previousVercel = process.env.VERCEL;
afterEach(() => {
  rpc.mockReset();
  if (previousVercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = previousVercel;
});

describe("shared API limits", () => {
  it("uses a stable pseudonymous actor across Vercel requests", async () => {
    process.env.VERCEL = "1";
    rpc.mockResolvedValue({ data: { allowed: true }, error: null });
    const request = (ip: string) => new NextRequest("https://example.org/api/ask", { headers: { "x-forwarded-for": ip } });
    expect(await publicRateLimit(request("192.0.2.1"), "ask")).toBeNull();
    expect(await publicRateLimit(request("192.0.2.1"), "ask")).toBeNull();
    expect(await publicRateLimit(request("192.0.2.2"), "ask")).toBeNull();
    const first = rpc.mock.calls[0][1].p_actor;
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).toBe(rpc.mock.calls[1][1].p_actor);
    expect(first).not.toBe(rpc.mock.calls[2][1].p_actor);
    expect(first).not.toContain("192.0.2.1");
  });

  it("returns retry advice and never calls a provider after a quota denial", async () => {
    rpc.mockResolvedValue({ data: { allowed: false, retry_after: 42 }, error: null });
    const response = await publicRateLimit(new NextRequest("http://localhost/api/ask"), "ask");
    expect(response?.status).toBe(429);
    expect(response?.headers.get("retry-after")).toBe("42");
    const operation = vi.fn();
    await expect(withProviderQuota("gemini", operation)).rejects.toBeInstanceOf(ApiLimitError);
    expect(operation).not.toHaveBeenCalled();
  });

  it("fails closed if the shared limiter is unavailable", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "database unavailable" } });
    const response = await publicRateLimit(new NextRequest("http://localhost/api/ask"), "ask");
    expect(response?.status).toBe(503);
    expect(response?.headers.get("retry-after")).toBe("30");
  });
});

describe("client networks and reported usage", () => {
  it("buckets IPv6 clients by /64 and keeps IPv4 addresses distinct", async () => {
    const { clientNetwork } = await import("@/lib/api-rate-limit");
    expect(clientNetwork("2001:db8:1:2:aaaa::1")).toBe("2001:db8:1:2::/64");
    expect(clientNetwork("2001:0DB8:0001:0002:ffff:ffff:ffff:ffff")).toBe("2001:db8:1:2::/64");
    expect(clientNetwork("2001:db8:1:3::1")).toBe("2001:db8:1:3::/64");
    expect(clientNetwork("[2001:db8::1]")).toBe("2001:db8:0:0::/64");
    expect(clientNetwork("::ffff:192.0.2.7")).toBe("192.0.2.7");
    expect(clientNetwork("192.0.2.7")).toBe("192.0.2.7");
    expect(clientNetwork("not-an-ip")).toBe("not-an-ip");
  });

  it("treats rotating addresses inside one IPv6 /64 as the same client", async () => {
    process.env.VERCEL = "1";
    rpc.mockResolvedValue({ data: { allowed: true }, error: null });
    const request = (ip: string) => new NextRequest("https://example.org/api/ask", { headers: { "x-forwarded-for": ip } });
    await publicRateLimit(request("2001:db8:5:6::1"), "ask");
    await publicRateLimit(request("2001:db8:5:6:dead:beef:0:9"), "ask");
    await publicRateLimit(request("2001:db8:5:7::1"), "ask");
    expect(rpc.mock.calls[0][1].p_actor).toBe(rpc.mock.calls[1][1].p_actor);
    expect(rpc.mock.calls[0][1].p_actor).not.toBe(rpc.mock.calls[2][1].p_actor);
  });

  it("charges extra provider units, stops at the cap, and bounds a runaway count", async () => {
    const { recordProviderUsage } = await import("@/lib/api-rate-limit");
    rpc.mockResolvedValue({ data: { allowed: true }, error: null });
    await recordProviderUsage("google_search", 3);
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(rpc.mock.calls[0][1]).toEqual({ p_action: "google_search", p_actor: null });
    rpc.mockReset();
    rpc.mockResolvedValue({ data: { allowed: true }, error: null });
    await recordProviderUsage("google_search", 10_000);
    expect(rpc).toHaveBeenCalledTimes(25);
    rpc.mockReset();
    rpc.mockResolvedValueOnce({ data: { allowed: true }, error: null }).mockResolvedValue({ data: { allowed: false, retry_after: 9 }, error: null });
    await expect(recordProviderUsage("google_search", 5)).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledTimes(2);
    rpc.mockReset();
    await recordProviderUsage("google_search", -1);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("keeps grounding working before the search-cap migration is applied, but fails closed otherwise", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "invalid action" } });
    const operation = vi.fn(async () => "ok");
    await expect(withProviderQuota("google_search", operation)).resolves.toBe("ok");
    await expect(withProviderQuota("gemini", operation)).rejects.toBeInstanceOf(ApiLimitError);
    rpc.mockResolvedValue({ data: null, error: { message: "database unavailable" } });
    await expect(withProviderQuota("google_search", operation)).rejects.toBeInstanceOf(ApiLimitError);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
