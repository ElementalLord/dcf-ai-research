"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Personality = { id: string; canonical_name: string };
type Source = { id: string; title: string; source_type: string; ingestion_status: string; textual_layer: string | null; source_personalities?: Array<{ personality_id: string }> };
type Coverage = { personality: { name: string; categoryName: string | null }; coverage: { disclaimer: string; overall: Record<string, number>; parameters: Array<Record<string, string | number | boolean>> } };
const steps = ["ingest", "tag", "embed", "extract_claims", "propose_events", "propose_relationships", "backfill", "benchmark"] as const;
const stepLabels: Record<(typeof steps)[number], string> = {
  ingest: "Ingest sources",
  tag: "Tag chunks",
  embed: "Generate embeddings",
  extract_claims: "Extract candidate claims",
  propose_events: "Propose events",
  propose_relationships: "Propose relationships",
  backfill: "Match claims to chunks",
  benchmark: "Run benchmark",
};

function message(payload: unknown): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === "string") return error;
    if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  }
  return "The onboarding operation failed.";
}

async function fetchOnboarding(personalityId = "") {
  const suffix = personalityId ? `?personalityId=${encodeURIComponent(personalityId)}` : "";
  const response = await fetch(`/api/corpus/onboard${suffix}`, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(message(payload));
  return payload;
}

export default function OnboardingPage() {
  const [personalities, setPersonalities] = useState<Personality[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [personalityId, setPersonalityId] = useState("");
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [selectedSteps, setSelectedSteps] = useState<string[]>(["tag", "embed", "extract_claims", "propose_events", "propose_relationships", "backfill"]);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let active = true;
    fetchOnboarding(personalityId).then((payload) => {
      if (!active) return;
      const nextId = personalityId || payload.personalities?.[0]?.id || "";
      setPersonalities(payload.personalities || []);
      setSources(payload.sources || []);
      setCoverage(payload.coverage || null);
      if (!personalityId && nextId) setPersonalityId(nextId);
      setSourceIds((payload.sources || []).filter((source: Source) => source.source_personalities?.some((link) => link.personality_id === nextId)).map((source: Source) => source.id));
    }).catch((error: unknown) => { if (active) setStatus(error instanceof Error ? error.message : "Could not load onboarding."); });
    return () => { active = false; };
  }, [personalityId]);

  const selectedPersonality = useMemo(() => personalities.find((item) => item.id === personalityId), [personalities, personalityId]);

  async function run() {
    setBusy(true); setStatus(""); setResult(null);
    try {
      const response = await fetch("/api/corpus/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personalityId, sourceIds, steps: selectedSteps }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(message(payload));
      setResult(payload);
      setCoverage(payload.coverage || null);
      setStatus("Onboarding workflow completed. Individual step failures, if any, are shown below.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Onboarding failed.");
    } finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-zinc-50 text-zinc-900"><div className="mx-auto max-w-7xl px-5 py-10">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Reusable corpus operations</p><h1 className="mt-2 text-4xl font-bold">Personality Onboarding</h1><p className="mt-2 max-w-3xl text-zinc-600">Run the shared source-first pipeline for any configured personality and its category framework.</p></div><nav className="flex gap-2"><Link className="rounded-lg border bg-white px-3 py-2 text-sm" href="/corpus">Corpus</Link><Link className="rounded-lg border bg-white px-3 py-2 text-sm" href="/review">Review</Link><Link className="rounded-lg border bg-white px-3 py-2 text-sm" href="/ask">Ask</Link></nav></div>
    {status && <div className="mt-6 rounded-xl border bg-white p-4 text-sm">{status}</div>}
    <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm"><div className="grid gap-5 md:grid-cols-2"><label className="text-sm font-medium">Personality<select className="input mt-2" value={personalityId} onChange={(event) => { setPersonalityId(event.target.value); setSourceIds([]); }}>{personalities.map((personality) => <option key={personality.id} value={personality.id}>{personality.canonical_name}</option>)}</select></label><div><p className="text-sm font-medium">Pipeline steps</p><div className="mt-2 flex flex-wrap gap-2">{steps.map((step) => <label key={step} className="rounded-lg border px-3 py-2 text-sm"><input className="mr-2" type="checkbox" checked={selectedSteps.includes(step)} onChange={() => setSelectedSteps((current) => current.includes(step) ? current.filter((item) => item !== step) : [...current, step])} />{stepLabels[step]}</label>)}</div></div></div>
      <div className="mt-6"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Approved source set</h2><button type="button" className="text-sm underline" onClick={() => setSourceIds(sourceIds.length === sources.length ? [] : sources.map((source) => source.id))}>{sourceIds.length === sources.length ? "Clear all" : "Select all"}</button></div><div className="mt-3 grid max-h-80 gap-2 overflow-auto md:grid-cols-2">{sources.map((source) => <label key={source.id} className="rounded-lg border p-3 text-sm"><input className="mr-2" type="checkbox" checked={sourceIds.includes(source.id)} onChange={() => setSourceIds((current) => current.includes(source.id) ? current.filter((id) => id !== source.id) : [...current, source.id])} /><span className="font-medium">{source.title}</span><span className="ml-2 text-xs text-zinc-500">{source.source_type} · {source.ingestion_status}</span></label>)}</div></div>
      <button type="button" disabled={busy || !personalityId || selectedSteps.length === 0} onClick={run} className="mt-6 rounded-xl bg-zinc-900 px-5 py-3 font-semibold text-white disabled:opacity-50">{busy ? "Running pipeline…" : `Run for ${selectedPersonality?.canonical_name || "personality"}`}</button>
    </section>
    {coverage && <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm"><h2 className="text-2xl font-semibold">Corpus coverage · {coverage.personality.name}</h2><p className="mt-1 text-sm text-zinc-500">{coverage.personality.categoryName}</p><p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{coverage.coverage.disclaimer}</p><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{Object.entries(coverage.coverage.overall).map(([key, value]) => <div key={key} className="rounded-xl border p-4"><p className="text-xs text-zinc-500">{key.replaceAll(/([A-Z])/g, " $1")}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>)}</div><div className="mt-6 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-zinc-500"><th className="p-2">Parameter</th><th className="p-2">Claims</th><th className="p-2">Exact passages</th><th className="p-2">Chunks</th><th className="p-2">Sources</th><th className="p-2">Layers</th></tr></thead><tbody>{coverage.coverage.parameters.map((parameter) => <tr key={String(parameter.id)} className="border-b"><td className="p-2 font-medium">{parameter.name}</td><td className="p-2">{parameter.approvedClaims}</td><td className="p-2">{parameter.claimsWithExactPassages} ({parameter.exactPassageCoveragePercent}%)</td><td className="p-2">{parameter.sourceChunks}</td><td className="p-2">{parameter.uniqueEvidenceSources}</td><td className="p-2">{parameter.textualLayers}</td></tr>)}</tbody></table></div></section>}
    {result != null && <details className="mt-8 rounded-2xl bg-zinc-950 p-5 text-zinc-100"><summary className="cursor-pointer font-semibold">Workflow result</summary><pre className="mt-4 max-h-[40rem] overflow-auto text-xs">{JSON.stringify(result, null, 2)}</pre></details>}
  </div></main>;
}
