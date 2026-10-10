import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, adminCookieOptions, makeAdminSession, validAdminToken } from "@/lib/admin-session";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.token !== "string" || !validAdminToken(body.token)) {
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
