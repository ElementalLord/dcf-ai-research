import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { makeAdminSession, validAdminSession, validAdminToken } from "@/lib/admin-session";

const previousHash = process.env.CORPUS_ADMIN_TOKEN_HASH;
const previousSecret = process.env.ADMIN_SESSION_SECRET;
const previousLegacy = process.env.CORPUS_ADMIN_TOKEN;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
afterEach(() => {
  if (previousHash === undefined) delete process.env.CORPUS_ADMIN_TOKEN_HASH; else process.env.CORPUS_ADMIN_TOKEN_HASH = previousHash;
  if (previousSecret === undefined) delete process.env.ADMIN_SESSION_SECRET; else process.env.ADMIN_SESSION_SECRET = previousSecret;
  if (previousLegacy === undefined) delete process.env.CORPUS_ADMIN_TOKEN; else process.env.CORPUS_ADMIN_TOKEN = previousLegacy;
});
describe("administrator session", () => {
  it("is closed when the access hash and session secret are not configured", () => {
    process.env.CORPUS_ADMIN_TOKEN = "old-plaintext-token";
    delete process.env.CORPUS_ADMIN_TOKEN_HASH;
    delete process.env.ADMIN_SESSION_SECRET;
    expect(validAdminToken("old-plaintext-token")).toBe(false);
    process.env.CORPUS_ADMIN_TOKEN_HASH = hash("test-review-token");
    expect(validAdminToken("test-review-token")).toBe(false);
    delete process.env.CORPUS_ADMIN_TOKEN;
    expect(validAdminToken("anything")).toBe(false);
    expect(validAdminSession("anything")).toBe(false);
  });
  it("accepts only the key matching the stored hash and a signed, unexpired session", () => {
    process.env.CORPUS_ADMIN_TOKEN_HASH = hash("test-review-token");
    process.env.ADMIN_SESSION_SECRET = "a".repeat(64);
    expect(validAdminToken("test-review-token")).toBe(true);
    expect(validAdminToken("test-review-token-extra")).toBe(false);
    const session = makeAdminSession();
    expect(validAdminSession(session)).toBe(true);
    expect(validAdminSession(`1.${session.split(".")[1]}`)).toBe(false);
    expect(validAdminSession(`${session.slice(0,-1)}${session.endsWith("0") ? "1" : "0"}`)).toBe(false);
    process.env.CORPUS_ADMIN_TOKEN_HASH = hash("rotated-token");
    expect(validAdminSession(session)).toBe(false);
    process.env.CORPUS_ADMIN_TOKEN_HASH = hash("test-review-token");
    process.env.ADMIN_SESSION_SECRET = "b".repeat(64);
    expect(validAdminSession(session)).toBe(false);
  });
});
