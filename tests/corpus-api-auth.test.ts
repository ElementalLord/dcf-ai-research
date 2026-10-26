import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { assertCorpusAdmin } from "@/lib/corpus/api";

const previousHash = process.env.CORPUS_ADMIN_TOKEN_HASH;
const previousSecret = process.env.ADMIN_SESSION_SECRET;

afterEach(() => {
  if (previousHash === undefined) delete process.env.CORPUS_ADMIN_TOKEN_HASH;
  else process.env.CORPUS_ADMIN_TOKEN_HASH = previousHash;
  if (previousSecret === undefined) delete process.env.ADMIN_SESSION_SECRET;
  else process.env.ADMIN_SESSION_SECRET = previousSecret;
});

describe("corpus administrator authorization", () => {
  it("requires the current key and rejects cross-origin writes", () => {
    process.env.CORPUS_ADMIN_TOKEN_HASH = createHash("sha256").update("current-test-key").digest("hex");
    process.env.ADMIN_SESSION_SECRET = "a".repeat(64);
    const request = (token: string, origin?: string) => new NextRequest("http://localhost/api/corpus/sources", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, ...(origin ? { origin } : {}) },
    });

    expect(assertCorpusAdmin(request("admin123"))?.status).toBe(401);
    expect(assertCorpusAdmin(request("current-test-key"))).toBeNull();
    expect(assertCorpusAdmin(request("current-test-key", "https://other.example"))?.status).toBe(403);
  });
});
