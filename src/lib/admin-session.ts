import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "dcf_admin";
const lifetime = 60 * 60 * 12;

function secret() { return process.env.CORPUS_ADMIN_TOKEN || ""; }
function signature(expires: string) { return createHmac("sha256", secret()).update(`dcf-admin:${expires}`).digest("hex"); }
export function validAdminToken(token: string) {
  const expected = secret();
  if (!expected || !token || Buffer.byteLength(token) !== Buffer.byteLength(expected)) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}
export function makeAdminSession() {
  const expires = String(Math.floor(Date.now() / 1000) + lifetime);
  return `${expires}.${signature(expires)}`;
}
export function validAdminSession(value?: string) {
  if (!secret() || !value) return false;
  const [expires, mac] = value.split(".");
  if (!/^\d+$/.test(expires || "") || !/^[a-f0-9]{64}$/.test(mac || "") || Number(expires) <= Date.now() / 1000) return false;
  return timingSafeEqual(Buffer.from(mac), Buffer.from(signature(expires)));
}
export async function hasAdminSession() {
  return validAdminSession((await cookies()).get(ADMIN_COOKIE)?.value);
}
export const adminCookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/", maxAge: lifetime };
