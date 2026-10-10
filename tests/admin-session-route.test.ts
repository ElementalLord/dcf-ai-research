import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/admin/session/route";

const previousHash = process.env.CORPUS_ADMIN_TOKEN_HASH;
const previousSecret = process.env.ADMIN_SESSION_SECRET;

afterEach(() => {
  if (previousHash === undefined) delete process.env.CORPUS_ADMIN_TOKEN_HASH;
  else process.env.CORPUS_ADMIN_TOKEN_HASH = previousHash;
  if (previousSecret === undefined) delete process.env.ADMIN_SESSION_SECRET;
  else process.env.ADMIN_SESSION_SECRET = previousSecret;
});

function login(code: string) {
  return POST(new NextRequest("http://localhost/api/admin/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: code }),
  }));
}

describe("admin code sign-in", () => {
  it("grants a signed HTTP-only session for the configured code", async () => {
    process.env.CORPUS_ADMIN_TOKEN_HASH = createHash("sha256").update("test-code").digest("hex");
    process.env.ADMIN_SESSION_SECRET = "a".repeat(64);
    const response = await login("test-code");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(response.headers.get("set-cookie")).toContain("dcf_admin=");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("denies an incorrect code without setting a session", async () => {
    process.env.CORPUS_ADMIN_TOKEN_HASH = createHash("sha256").update("test-code").digest("hex");
    process.env.ADMIN_SESSION_SECRET = "a".repeat(64);
    const response = await login("wrong-code");
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Invalid administrator access key." });
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
