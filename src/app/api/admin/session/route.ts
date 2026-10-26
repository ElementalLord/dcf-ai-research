import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, adminCookieOptions, makeAdminSession, validAdminToken } from "@/lib/admin-session";
import { publicRateLimit } from "@/lib/api-rate-limit";
import { readLimitedBody, RequestBodyTooLarge } from "@/lib/limited-request-body";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Invalid origin." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json({ error: "JSON is required." }, { status: 415, headers: { "Cache-Control": "no-store" } });
  }
  const limited = await publicRateLimit(request, "login");
  if (limited) return limited;
  let raw: string;
  try { raw = await readLimitedBody(request, 1024); }
  catch (error) {
    return NextResponse.json({ error: error instanceof RequestBodyTooLarge ? "Request is too large." : "Invalid request." },
      { status: error instanceof RequestBodyTooLarge ? 413 : 400, headers: { "Cache-Control": "no-store" } });
  }
  let body: unknown;
  try { body = JSON.parse(raw); } catch { body = null; }
  if (!body || typeof body !== "object" || !("token" in body) || typeof body.token !== "string" || !validAdminToken(body.token)) {
    return NextResponse.json({ error: "Invalid administrator access key." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const response = NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(ADMIN_COOKIE, makeAdminSession(), adminCookieOptions);
  return response;
}
export async function DELETE() {
  const response = NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.delete(ADMIN_COOKIE);
  return response;
}
