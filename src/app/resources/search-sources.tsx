"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Rule = { id: string; domain: string; display_name: string; status: "allowed" | "blocked" | "disabled"; category: string; notes: string };
type Discovered = { domain: string; example_url: string; display_name: string; category: string; first_seen_at: string };
type Policy = { mode: "credible_web" | "approved_domains_only" | "custom"; rules: Rule[]; discovered: Discovered[] };
type Draft = Omit<Rule, "id">;
const blank: Draft = { domain: "", display_name: "", status: "allowed", category: "institutional", notes: "" };
const labels: Record<Policy["mode"], string> = { credible_web: "Credible Web", approved_domains_only: "Approved Domains Only", custom: "Custom" };

async function request<T>(method = "GET", body?: unknown): Promise<T> {
  const response = await fetch("/api/resources/search-sources", { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : result.error?.message || "Search sources could not be updated.");
  return result as T;
}

export default function SearchSources() {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function reload() { setPolicy(await request<Policy>()); }
  useEffect(() => { void request<Policy>().then(setPolicy).catch(() => setError("Search policy could not be loaded. Refresh to try again.")); }, []);
  async function act(method: string, body: unknown, success: string) {
    setBusy(true); setError(""); setNotice("");
    try { await request(method, body); await reload(); setDraft(null); setNotice(success); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Search sources could not be updated."); }
    finally { setBusy(false); }
  }
  function edit(rule?: Rule) { setError(""); setDraft(rule ? { domain: rule.domain, display_name: rule.display_name, status: rule.status, category: rule.category, notes: rule.notes } : { ...blank }); }
  function fromDiscovery(item: Discovered, status: Draft["status"]) { setDraft({ domain: item.domain, display_name: item.display_name, status, category: item.category, notes: `Discovered at ${item.example_url}` }); }
  const visible = policy?.rules.filter((rule) => `${rule.domain} ${rule.display_name} ${rule.category} ${rule.notes}`.toLowerCase().includes(query.toLowerCase())) || [];
  return <section className="search-sources-panel" aria-labelledby="search-sources-title">
    <div className="search-sources-head"><div><p className="section-label">Live research controls</p><h2 id="search-sources-title">Search Sources</h2><p>Control the domains DCF may use during Ask. These settings do not approve sources or claims for the Library.</p></div><Button variant="outline" onClick={() => edit()} disabled={busy}>Add domain</Button></div>
    <div className="search-policy-line"><label htmlFor="search-policy-mode">Current policy</label><select id="search-policy-mode" value={policy?.mode || "credible_web"} disabled={!policy || busy} onChange={(event) => void act("PATCH", { mode: event.target.value }, "Search policy updated.")}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><span>{policy?.mode === "approved_domains_only" ? "Only allowed domains can be used." : policy?.mode === "custom" ? "Allowed domains and credible new sources can be used; blocks always apply." : "DCF may discover credible new sources; blocks always apply."}</span></div>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="resource-notice" role="status">{notice}</p>}
    <div className="search-sources-tools"><label>Find domain<Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search rules"/></label><span>{policy ? `${policy.rules.length} domain rules` : "Loading policy…"}</span></div>
    <div className="search-sources-table"><Table><TableHeader><TableRow><TableHead>Domain / source</TableHead><TableHead>Status</TableHead><TableHead>Category</TableHead><TableHead>Search</TableHead><TableHead>Notes</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>{visible.map((rule) => <TableRow key={rule.id}><TableCell><strong>{rule.display_name}</strong><small>{rule.domain}</small></TableCell><TableCell>{rule.status}</TableCell><TableCell>{rule.category}</TableCell><TableCell>{rule.status === "allowed" ? "Allowed" : "No"}</TableCell><TableCell className="search-source-note">{rule.notes || "—"}</TableCell><TableCell><Button size="sm" variant="ghost" onClick={() => edit(rule)}>Edit</Button></TableCell></TableRow>)}</TableBody></Table>{policy && !visible.length && <p className="empty-note">{query ? "No rules match this filter." : "No custom rules yet. Credible Web remains open to verified sources."}</p>}</div>
    {policy?.discovered.length ? <div className="discovered-sources"><h3>Discovered during Ask</h3><p>These are candidates only. Allowing a domain for search does not approve its content for the Library.</p>{policy.discovered.filter((item) => !policy.rules.some((rule) => item.domain === rule.domain)).slice(0, 20).map((item) => <div className="discovered-source" key={item.domain}><div><strong>{item.display_name}</strong><small>{item.domain} · {item.category}</small></div><Button size="sm" variant="outline" onClick={() => fromDiscovery(item, "allowed")}>Allow</Button><Button size="sm" variant="outline" onClick={() => fromDiscovery(item, "blocked")}>Block</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => void act("PATCH", { ignoreDomain: item.domain }, "Discovery ignored.")}>Ignore</Button></div>)}</div> : null}
    <Dialog open={!!draft} onOpenChange={(open) => { if (!open && !busy) setDraft(null); }}><DialogContent><DialogHeader><DialogTitle>{draft?.domain && policy?.rules.some((rule) => rule.domain === draft.domain) ? "Edit search domain" : "Add search domain"}</DialogTitle><DialogDescription>Rules apply to Google grounding and Brave fallback. A disabled domain can be enabled later.</DialogDescription></DialogHeader>{draft && <div className="sheet-fields"><label>Domain<Input value={draft.domain} onChange={(event) => setDraft({ ...draft, domain: event.target.value })} disabled={busy}/></label><label>Source name<Input value={draft.display_name} onChange={(event) => setDraft({ ...draft, display_name: event.target.value })} disabled={busy}/></label><label>Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as Draft["status"] })} disabled={busy}><option value="allowed">Allowed</option><option value="blocked">Blocked</option><option value="disabled">Temporarily disabled</option></select></label><label>Category<Input value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} disabled={busy}/></label><label>Notes<Textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} disabled={busy}/></label></div>}{error && <p className="form-error" role="alert">{error}</p>}<div className="search-source-actions"><Button variant="outline" onClick={() => setDraft(null)} disabled={busy}>Cancel</Button>{draft && policy?.rules.some((rule) => rule.domain === draft.domain) && <Button variant="ghost" disabled={busy} onClick={() => void act("DELETE", { domain: draft.domain }, "Rule removed.")}>Remove rule</Button>}<Button disabled={busy || !draft?.domain || !draft.display_name || !draft.category} onClick={() => void act("POST", draft, "Search source saved.")}>{busy ? "Saving…" : "Save rule"}</Button></div></DialogContent></Dialog>
  </section>;
}
