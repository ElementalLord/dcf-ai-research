import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

type PublicAction = "ask" | "feedback" | "login";
type Provider = "gemini" | "brave" | "google_search";

// Actions added after the original limiter migration. Until their migration is applied the database
// rejects them as unknown; the existing Gemini caps still bound that spend, so only that case is skipped.
const OPTIONAL_ACTIONS = new Set<string>(["google_search"]);
// A crafted request can make the model run many searches; charge at most this many per call.
const MAX_RECORDED_UNITS = 25;

export class ApiLimitError extends Error {
  constructor(readonly retryAfter: number, readonly unavailable = false) {
    super(unavailable ? "Rate limiting unavailable" : "Rate limit exceeded");
  }
}

function ipv6Groups(address: string): string[] | null {
  let value = address;
  const embedded = value.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (embedded) {
    const [a, b, c, d] = embedded.slice(1).map(Number);
    value = `${value.slice(0, -embedded[0].length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const groups = halves.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right] : left;
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.map((group) => parseInt(group, 16).toString(16));
}

/**
 * One rate-limit bucket per client network. An IPv6 user normally controls a whole /64 (often more),
 * so limiting single IPv6 addresses lets one client rotate through billions of identities.
 */
export function clientNetwork(raw: string): string {
  const address = raw.trim().toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  if (isIP(address) !== 6) return address;
  const groups = ipv6Groups(address);
  if (!groups) return address;
  if (groups.slice(0, 5).every((group) => group === "0") && groups[5] === "ffff") {
    // IPv4-mapped IPv6 is the IPv4 client itself.
    const high = parseInt(groups[6], 16), low = parseInt(groups[7], 16);
    return [high >> 8, high & 255, low >> 8, low & 255].join(".");
  }
  return `${groups.slice(0, 4).join(":")}::/64`;
}

function actorKey(request: NextRequest): string {
  // Vercel overwrites this header; arbitrary forwarding headers are not trusted.
  const ip = process.env.VERCEL ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() : null;
  const identifier = ip ? clientNetwork(ip) : (process.env.NODE_ENV === "production" ? "unknown" : "local");
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "local-development";
  return createHmac("sha256", secret).update(identifier).digest("hex");
}

async function reserve(action: PublicAction | Provider, actor?: string): Promise<void> {
  const { data, error } = await supabaseAdmin.rpc("reserve_api_rate_slot", { p_action: action, p_actor: actor || null });
  if (error && OPTIONAL_ACTIONS.has(action) && /invalid action|rate policy missing/i.test(error.message || "")) return;
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

/**
 * Charges billable units a provider reported after the call (for example, the extra Google searches a
 * grounded prompt ran) so the shared cap reflects real spend and blocks further calls once it is reached.
 * The spend already happened, so this never throws.
 */
export async function recordProviderUsage(provider: Provider, units: number): Promise<void> {
  const count = Math.min(MAX_RECORDED_UNITS, Math.max(0, Math.floor(Number(units) || 0)));
  for (let index = 0; index < count; index += 1) {
    try { await reserve(provider); } catch { return; }
  }
}
