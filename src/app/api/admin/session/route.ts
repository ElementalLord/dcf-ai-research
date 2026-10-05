import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, adminCookieOptions, makeAdminSession, validAdminToken } from "@/lib/admin-session";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.token !== "string" || !validAdminToken(body.token)) {
    return NextResponse.json({ error: "Invalid administrator token." }, { status: 401 });
  }
  const response = NextResponse.json({ success: true });
  response.cookies.set(ADMIN_COOKIE, makeAdminSession(), adminCookieOptions);
  return response;
}
export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(ADMIN_COOKIE);
  return response;
}
