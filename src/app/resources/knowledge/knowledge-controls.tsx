"use client";

import { useState } from "react";

type Policy = { request_limit_micro: number; daily_limit_micro: number; monthly_limit_micro: number;
  max_paid_calls: number; max_concurrent_jobs: number; research_paused: boolean; auto_admission_paused: boolean };
const dollars = (micro: number) => Number((micro / 1_000_000).toFixed(3));

export default function KnowledgeControls({ policy }: { policy: Policy }) {
  const [values, setValues] = useState({ requestLimitUsd: dollars(policy.request_limit_micro), dailyLimitUsd: dollars(policy.daily_limit_micro),
    monthlyLimitUsd: dollars(policy.monthly_limit_micro), maxPaidCalls: policy.max_paid_calls,
    maxConcurrentJobs: policy.max_concurrent_jobs, researchPaused: policy.research_paused,
    autoAdmissionPaused: policy.auto_admission_paused });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const setNumber = (key: "requestLimitUsd" | "dailyLimitUsd" | "monthlyLimitUsd" | "maxPaidCalls" | "maxConcurrentJobs", value: number) =>
    setValues(current => ({ ...current, [key]: value }));
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/resources/knowledge-policy", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      if (!response.ok) throw new Error("Policy could not be saved.");
      setMessage("Policy saved. New research requests use these limits.");
    } catch { setMessage("Policy could not be saved. Check the limits and try again."); }
    finally { setBusy(false); }
  }
  return <form className="knowledge-controls" onSubmit={save}>
    <h3>Budget and publication controls</h3>
    <div className="knowledge-control-grid">
      <label>Per request ceiling (USD)<input type="number" min="0.01" max="10" step="0.01" value={values.requestLimitUsd} onChange={event => setNumber("requestLimitUsd", Number(event.target.value))} required/></label>
      <label>Daily allowance (USD)<input type="number" min="0.01" max="1000" step="0.01" value={values.dailyLimitUsd} onChange={event => setNumber("dailyLimitUsd", Number(event.target.value))} required/></label>
      <label>Monthly allowance (USD)<input type="number" min="0.01" max="10000" step="0.01" value={values.monthlyLimitUsd} onChange={event => setNumber("monthlyLimitUsd", Number(event.target.value))} required/></label>
      <label>Maximum paid calls<input type="number" min="1" max="8" step="1" value={values.maxPaidCalls} onChange={event => setNumber("maxPaidCalls", Number(event.target.value))} required/></label>
      <label>Concurrent research jobs<input type="number" min="1" max="100" step="1" value={values.maxConcurrentJobs} onChange={event => setNumber("maxConcurrentJobs", Number(event.target.value))} required/></label>
    </div>
    <div className="knowledge-pause-controls"><label><input type="checkbox" checked={values.researchPaused} onChange={event => setValues(current => ({ ...current, researchPaused: event.target.checked }))}/> Pause new research</label>
      <label><input type="checkbox" checked={values.autoAdmissionPaused} onChange={event => setValues(current => ({ ...current, autoAdmissionPaused: event.target.checked }))}/> Pause automatic admission</label></div>
    <button type="submit" disabled={busy}>{busy ? "Saving…" : "Save policy"}</button>
    {message && <p role="status">{message}</p>}
  </form>;
}
