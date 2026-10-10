import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "dcf_admin";
const lifetime = 60 * 60 * 12;

function tokenHash() {
  const value = process.env.CORPUS_ADMIN_TOKEN_HASH || "";
  return /^[a-f0-9]{64}$/i.test(value) ? Buffer.from(value, "hex") : null;
}
function sessionSecret() {
  const value = process.env.ADMIN_SESSION_SECRET || "";
  return /^(?:[a-f0-9]{2}){32,}$/i.test(value) ? Buffer.from(value, "hex") : null;
}
function signature(expires: string) {
  const key = sessionSecret();
  const credential = tokenHash();
  if (!key || !credential) throw new Error("Admin access is not configured.");
  return createHmac("sha256", key).update(`dcf-admin:${expires}:`).update(credential).digest("hex");
}
export function validAdminToken(token: string) {
  const expected = tokenHash();
  if (!expected || !sessionSecret() || !token || token.length > 256) return false;
  const actual = createHash("sha256").update(token).digest();
  return timingSafeEqual(actual, expected);
}
export function makeAdminSession() {
  const expires = String(Math.floor(Date.now() / 1000) + lifetime);
  return `${expires}.${signature(expires)}`;
}
export function validAdminSession(value?: string) {
  if (!tokenHash() || !sessionSecret() || !value) return false;
  const [expires, mac] = value.split(".");
  if (!/^\d+$/.test(expires || "") || !/^[a-f0-9]{64}$/.test(mac || "") || Number(expires) <= Date.now() / 1000) return false;
  return timingSafeEqual(Buffer.from(mac, "hex"), Buffer.from(signature(expires), "hex"));
}
export async function hasAdminSession() {
  return validAdminSession((await cookies()).get(ADMIN_COOKIE)?.value);
}
export const adminCookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/", maxAge: lifetime };
