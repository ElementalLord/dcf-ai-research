import { NextRequest, NextResponse } from "next/server";
import { CorpusError, safeError } from "./errors";

export const MAX_JSON_BYTES = 64 * 1024;

export function assertRequestSize(request: NextRequest, maxBytes = MAX_JSON_BYTES): void {
  const size = Number(request.headers.get("content-length") || 0);
  if (size > maxBytes) throw new CorpusError("INVALID_INPUT", "The request body is too large.", 413);
}

export function assertCorpusAdmin(request: NextRequest): NextResponse | null {
  const configuredToken = process.env.CORPUS_ADMIN_TOKEN;
  if (!configuredToken) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: { code: "ADMIN_NOT_CONFIGURED", message: "Corpus administration is disabled until CORPUS_ADMIN_TOKEN is configured." } },
        { status: 503 },
      );
    }
    return null;
  }
  const supplied = request.headers.get("authorization");
  if (supplied !== `Bearer ${configuredToken}`) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Corpus administrator authorization is required." } }, { status: 401 });
  }
  return null;
}

export function corpusErrorResponse(error: unknown): NextResponse {
  const safe = safeError(error);
  console.error("Corpus API error:", safe.code, safe.message);
  return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
}
