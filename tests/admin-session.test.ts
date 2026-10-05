import { afterEach, describe, expect, it } from "vitest";
import { makeAdminSession, validAdminSession, validAdminToken } from "@/lib/admin-session";

const previous = process.env.CORPUS_ADMIN_TOKEN;
afterEach(() => { if (previous === undefined) delete process.env.CORPUS_ADMIN_TOKEN; else process.env.CORPUS_ADMIN_TOKEN = previous; });
describe("administrator session", () => {
  it("is closed when the administrator token is not configured", () => {
    delete process.env.CORPUS_ADMIN_TOKEN;
    expect(validAdminToken("anything")).toBe(false);
    expect(validAdminSession("anything")).toBe(false);
  });
  it("accepts only the configured token and a signed, unexpired session", () => {
    process.env.CORPUS_ADMIN_TOKEN = "test-review-token";
    expect(validAdminToken("test-review-token")).toBe(true);
    expect(validAdminToken("test-review-token-extra")).toBe(false);
    const session = makeAdminSession();
    expect(validAdminSession(session)).toBe(true);
    expect(validAdminSession(`1.${session.split(".")[1]}`)).toBe(false);
    expect(validAdminSession(`${session.slice(0,-1)}${session.endsWith("0") ? "1" : "0"}`)).toBe(false);
    process.env.CORPUS_ADMIN_TOKEN = "rotated-token";
    expect(validAdminSession(session)).toBe(false);
  });
});
