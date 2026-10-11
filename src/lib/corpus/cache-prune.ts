import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

const lastPruned = new Map<string, number>();

/** Expired cache rows are never read again. Clear them when a fresh row is written, at most every ten minutes per table. */
export async function pruneExpiredCache(table: "answer_cache" | "web_search_cache") {
  if (Date.now() - (lastPruned.get(table) || 0) < 10 * 60_000) return;
  lastPruned.set(table, Date.now());
  try { await supabaseAdmin.from(table).delete().lt("expires_at", new Date().toISOString()); }
  catch { /* Caches are optional; a failed cleanup never affects an answer. */ }
}
