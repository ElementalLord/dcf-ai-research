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
