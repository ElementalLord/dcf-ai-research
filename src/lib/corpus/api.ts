import { NextRequest, NextResponse } from "next/server";
import { CorpusError, safeError } from "./errors";
import { ADMIN_COOKIE, validAdminSession } from "@/lib/admin-session";

export const MAX_JSON_BYTES = 64 * 1024;

export function assertRequestSize(request: NextRequest, maxBytes = MAX_JSON_BYTES): void {
  const size = Number(request.headers.get("content-length") || 0);
  if (size > maxBytes) throw new CorpusError("INVALID_INPUT", "The request body is too large.", 413);
}

export function assertCorpusAdmin(request: NextRequest): NextResponse | null {
  if (validAdminSession(request.cookies.get(ADMIN_COOKIE)?.value)) return null;
  const configuredToken = process.env.CORPUS_ADMIN_TOKEN;
  if (configuredToken && request.headers.get("authorization") === `Bearer ${configuredToken}`) return null;
  return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Administrator authorization is required." } }, { status: 401 });
}

export function corpusErrorResponse(error: unknown): NextResponse {
  const safe = safeError(error);
  console.error("Corpus API error:", safe.code, safe.message);
  return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
}
