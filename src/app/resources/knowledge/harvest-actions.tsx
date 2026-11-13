"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Action = "promote" | "reject" | "restore";
const DONE: Record<Action, string> = { promote: "Added to the Library as a candidate source.", reject: "Rejected. It will not be reused.", restore: "Restored." };

/** Reviewer decisions for one harvested source. Promotion never approves anything; it queues the source for normal review. */
export default function HarvestActions({ sourceId, status }: { sourceId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Action | null>(null);
  const [message, setMessage] = useState("");
  async function decide(action: Action) {
    if (busy) return;
    setBusy(action); setMessage("");
    try {
      const response = await fetch("/api/resources/knowledge-harvest", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceId, action }) });
      if (!response.ok) throw new Error("failed");
      setMessage(DONE[action]);
      router.refresh();
    } catch { setMessage("Could not save. Try again."); }
    finally { setBusy(null); }
  }
  return <div className="harvest-actions">
    {status === "rejected"
      ? <button type="button" onClick={() => decide("restore")} disabled={Boolean(busy)}>{busy === "restore" ? "Restoring…" : "Restore"}</button>
      : <>{status !== "promoted" && <button type="button" onClick={() => decide("promote")} disabled={Boolean(busy)}>{busy === "promote" ? "Adding…" : "Add to Library"}</button>}
        <button type="button" className="harvest-secondary" onClick={() => decide("reject")} disabled={Boolean(busy)}>{busy === "reject" ? "Rejecting…" : "Reject"}</button></>}
    {message && <p role="status">{message}</p>}
  </div>;
}
