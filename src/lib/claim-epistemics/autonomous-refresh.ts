import "server-only";
import { logStage } from "@/lib/corpus/observability";
import { refreshBlockedEpistemics } from "./engine";

/**
 * Keeps approved claims usable without a reviewer. After an answer, the claims of the people it was about are
 * evaluated again, upgrade-only (see refreshBlockedEpistemics). It needs no model or search call, runs after the
 * response, and repeats for the same person at most once per interval in each server instance.
 */
export const epistemicRefreshEnabled = () => process.env.EPISTEMIC_AUTO_REFRESH_ENABLED !== "false";
const INTERVAL_MS = 6 * 60 * 60_000;
const lastRun = new Map<string, number>();

/** Test hook. */
export function resetEpistemicRefreshSchedule(): void { lastRun.clear(); }

export function epistemicRefreshDue(personalityId: string, now = Date.now()): boolean {
  if (!epistemicRefreshEnabled()) return false;
  const last = lastRun.get(personalityId);
  return last === undefined || now - last >= INTERVAL_MS;
}

/** Never throws. */
export async function refreshPersonalityEpistemics(personalityIds: string[]): Promise<Array<{ personalityId: string; upgraded: number } | null>> {
  return Promise.all(personalityIds.filter((id) => epistemicRefreshDue(id)).map(async (personalityId) => {
    lastRun.set(personalityId, Date.now());
    try {
      const result = await refreshBlockedEpistemics(personalityId);
      logStage("EPISTEMIC_REFRESH", { evaluated: result.evaluated, blockedBefore: result.blockedBefore, upgraded: result.upgraded });
      return { personalityId, upgraded: result.upgraded };
    } catch {
      // Try again sooner after a transient failure.
      lastRun.set(personalityId, Date.now() - INTERVAL_MS + 10 * 60_000);
      return null;
    }
  }));
}
