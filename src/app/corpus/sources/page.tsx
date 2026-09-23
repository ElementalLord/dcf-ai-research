"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Rule = {
  id: string; display_name: string; domain: string; scope_type: "DOMAIN" | "PATH_PREFIX" | "EXACT_URL";
  allowed_path_prefix: string | null; exact_url: string | null; include_subdomains: boolean;
  allow_live_search: boolean; allow_live_fetch: boolean; allow_ingestion: boolean;
  evidence_use_status: "candidate" | "approved" | "rejected"; priority: number; cache_ttl_hours: number; is_active: boolean;
  approval_origin: string; approval_note: string | null; approved_by_label: string | null;
};
type Cache = { id: string; canonical_url: string; retrieved_at: string; expires_at: string; hit_count: number; fetch_status: string; fetch_error: string | null };

function message(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: { message?: string } }).error;
    if (error?.message) return error.message;
  }
  return fallback;
}

export default function ApprovedSourcesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [cache, setCache] = useState<Cache[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ displayName: "", domain: "", scopeType: "EXACT_URL" as Rule["scope_type"], exactUrl: "", allowedPathPrefix: "", cacheTtlHours: 168 });

  const load = useCallback(async () => {
    const response = await fetch("/api/corpus/source-access", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(message(payload, "Source permissions could not be loaded."));
    setRules(payload.rules || []); setCache(payload.cache || []);
  }, []);
  useEffect(() => { load().catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Loading failed.")); }, [load]);

  async function createRule(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/corpus/source-access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        ...form,
        exactUrl: form.scopeType === "EXACT_URL" ? form.exactUrl : null,
        allowedPathPrefix: form.scopeType === "PATH_PREFIX" ? form.allowedPathPrefix : null,
        allowLiveSearch: false, allowLiveFetch: false, allowIngestion: false,
        evidenceUseStatus: "candidate", priority: 100, isActive: true,
      }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(message(payload, "Rule creation failed."));
      setForm({ displayName: "", domain: "", scopeType: "EXACT_URL", exactUrl: "", allowedPathPrefix: "", cacheTtlHours: 168 });
      setNotice("Candidate access rule created. Enable network permissions and evidence use only after review.");
      await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Rule creation failed."); } finally { setBusy(false); }
  }

  async function update(id: string, changes: Record<string, unknown>) {
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/corpus/source-access", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...changes }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(message(payload, "Rule update failed."));
      await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Rule update failed."); } finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-zinc-50 text-zinc-900"><div className="mx-auto max-w-7xl px-5 py-10">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Server-only source firewall</p><h1 className="mt-2 text-4xl font-bold">Approved Internet Sources</h1><p className="mt-2 max-w-3xl text-zinc-600">Network access, evidence use, and claim approval are separate controls. New rules start disabled and candidate-only.</p></div><nav className="flex gap-2"><Link className="rounded-lg border bg-white px-3 py-2 text-sm" href="/corpus">Corpus</Link><Link className="rounded-lg border bg-white px-3 py-2 text-sm" href="/ask">Ask</Link></nav></div>
    {notice && <div className="mt-6 rounded-xl border bg-white p-4 text-sm">{notice}</div>}
    <form onSubmit={createRule} className="mt-8 rounded-2xl border bg-white p-6 shadow-sm"><h2 className="text-xl font-semibold">Register a candidate scope</h2><div className="mt-4 grid gap-3 md:grid-cols-3"><input className="input" required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="Display name"/><input className="input" required value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="example.org"/><select className="input" value={form.scopeType} onChange={(e) => setForm({ ...form, scopeType: e.target.value as Rule["scope_type"] })}><option>EXACT_URL</option><option>PATH_PREFIX</option><option>DOMAIN</option></select>{form.scopeType === "EXACT_URL" && <input className="input md:col-span-2" required value={form.exactUrl} onChange={(e) => setForm({ ...form, exactUrl: e.target.value })} placeholder="https://example.org/approved-page"/>}{form.scopeType === "PATH_PREFIX" && <input className="input md:col-span-2" required value={form.allowedPathPrefix} onChange={(e) => setForm({ ...form, allowedPathPrefix: e.target.value })} placeholder="/approved/research/"/>}<label className="text-sm">Cache TTL hours<input className="input mt-1" type="number" min={1} max={8760} value={form.cacheTtlHours} onChange={(e) => setForm({ ...form, cacheTtlHours: Number(e.target.value) })}/></label></div><button disabled={busy} className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50">Create disabled candidate rule</button></form>
    <section className="mt-8 overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="border-b p-5"><h2 className="text-xl font-semibold">Authorization registry ({rules.length})</h2></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-zinc-50 text-zinc-500"><tr><th className="p-3">Scope</th><th className="p-3">Network access</th><th className="p-3">Evidence status</th><th className="p-3">Approval origin</th><th className="p-3">TTL</th><th className="p-3">State</th></tr></thead><tbody>{rules.map((rule) => <tr key={rule.id} className="border-t align-top"><td className="p-3"><p className="font-medium">{rule.display_name}</p><p className="mt-1 max-w-lg break-all text-xs text-zinc-500">{rule.scope_type}: {rule.exact_url || rule.domain + (rule.allowed_path_prefix || "")}</p></td><td className="p-3 space-y-1"><label className="block"><input type="checkbox" checked={rule.allow_live_search} onChange={(e) => update(rule.id, { allowLiveSearch: e.target.checked })}/> search</label><label className="block"><input type="checkbox" checked={rule.allow_live_fetch} onChange={(e) => update(rule.id, { allowLiveFetch: e.target.checked })}/> fetch</label><label className="block"><input type="checkbox" checked={rule.allow_ingestion} onChange={(e) => update(rule.id, { allowIngestion: e.target.checked })}/> ingest</label></td><td className="p-3"><select className="rounded border p-1" value={rule.evidence_use_status} onChange={(e) => update(rule.id, { evidenceUseStatus: e.target.value, approvalOrigin: "human_manual", approvedByLabel: "Corpus reviewer", approvalNote: "Evidence status reviewed in source administration." })}><option>candidate</option><option>approved</option><option>rejected</option></select></td><td className="p-3"><p>{rule.approval_origin}</p>{rule.approval_note && <p className="mt-1 max-w-xs text-xs text-zinc-500">{rule.approval_note}</p>}</td><td className="p-3">{rule.cache_ttl_hours}h</td><td className="p-3"><button disabled={busy} onClick={() => update(rule.id, { isActive: !rule.is_active })} className="rounded border px-2 py-1">{rule.is_active ? "Active" : "Inactive"}</button></td></tr>)}</tbody></table></div></section>
    <section className="mt-8 overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="border-b p-5"><h2 className="text-xl font-semibold">Live cache ({cache.length})</h2></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-zinc-50 text-zinc-500"><tr><th className="p-3">URL</th><th className="p-3">Status</th><th className="p-3">Retrieved / expires</th><th className="p-3">Hits</th></tr></thead><tbody>{cache.map((item) => <tr key={item.id} className="border-t"><td className="max-w-xl break-all p-3">{item.canonical_url}{item.fetch_error && <p className="text-xs text-red-700">{item.fetch_error}</p>}</td><td className="p-3">{item.fetch_status}</td><td className="p-3 text-xs">{new Date(item.retrieved_at).toLocaleString()}<br/>{new Date(item.expires_at).toLocaleString()}</td><td className="p-3">{item.hit_count}</td></tr>)}</tbody></table></div></section>
  </div></main>;
}
