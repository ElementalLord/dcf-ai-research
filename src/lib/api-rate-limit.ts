import "server-only";
import { createHmac } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

type PublicAction = "ask" | "feedback" | "login";
type Provider = "gemini" | "brave";

export class ApiLimitError extends Error {
  constructor(readonly retryAfter: number, readonly unavailable = false) {
    super(unavailable ? "Rate limiting unavailable" : "Rate limit exceeded");
  }
}

function actorKey(request: NextRequest): string {
  // Vercel overwrites this header; arbitrary forwarding headers are not trusted.
  const ip = process.env.VERCEL ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() : null;
  const identifier = ip || (process.env.NODE_ENV === "production" ? "unknown" : "local");
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "local-development";
  return createHmac("sha256", secret).update(identifier).digest("hex");
}

async function reserve(action: PublicAction | Provider, actor?: string): Promise<void> {
  const { data, error } = await supabaseAdmin.rpc("reserve_api_rate_slot", { p_action: action, p_actor: actor || null });
  if (error || !data || typeof data !== "object" || typeof data.allowed !== "boolean") {
    throw new ApiLimitError(30, true);
  }
  if (!data.allowed) throw new ApiLimitError(Math.max(1, Math.min(2592000, Number(data.retry_after) || 60)));
}

export async function publicRateLimit(request: NextRequest, action: PublicAction): Promise<NextResponse | null> {
  try {
    await reserve(action, actorKey(request));
    return null;
  } catch (error) {
    const limited = error instanceof ApiLimitError ? error : new ApiLimitError(30, true);
    return NextResponse.json({ error: limited.unavailable ? "Service temporarily unavailable." : "Too many requests. Try again later." },
      { status: limited.unavailable ? 503 : 429, headers: { "Cache-Control": "no-store", "Retry-After": String(limited.retryAfter) } });
  }
}

export async function withProviderQuota<T>(provider: Provider, operation: () => Promise<T>): Promise<T> {
  await reserve(provider);
  return operation();
}
