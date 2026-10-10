"use client";

import { useEffect, useState } from "react";
import { Check, LoaderCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

type Rule = { id: string; domain: string; display_name: string; status: "allowed" | "blocked" | "disabled"; category: string; notes: string };
type Discovered = { domain: string; example_url: string; display_name: string; category: string; first_seen_at: string };
type Policy = { mode: "credible_web" | "approved_domains_only" | "custom"; rules: Rule[]; discovered: Discovered[] };
type Draft = Omit<Rule, "id">;
const blank: Draft = { domain: "", display_name: "", status: "allowed", category: "institutional", notes: "" };
const labels: Record<Policy["mode"], string> = { credible_web: "Credible Web", approved_domains_only: "Approved Sources Only", custom: "Credible Web with rules" };
const modeHelp: Record<Policy["mode"], string> = {
  credible_web: "Search credible websites, while honoring any allowed or blocked domain rules below.",
  approved_domains_only: "Search only domains explicitly marked Allowed below.",
  custom: "Search credible websites with your allowed and blocked domain rules.",
};

async function request<T>(method = "GET", body?: unknown): Promise<T> {
  const response = await fetch("/api/resources/search-sources", { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : result.error?.message || "Search sources could not be updated.");
  return result as T;
}

export default function SearchSources() {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"rules" | "discovered">("rules");
  const [shownRules, setShownRules] = useState(8);
  const [shownDiscoveries, setShownDiscoveries] = useState(5);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function reload() { setPolicy(await request<Policy>()); }
  useEffect(() => { void request<Policy>().then(setPolicy).catch(() => setError("Search rules could not be loaded. Try again.")).finally(() => setLoading(false)); }, []);
  async function act(method: string, body: unknown, success: string) {
    setBusy(true); setActivity("Updating search rules…"); setError(""); setNotice("");
    try { await request(method, body); setDraft(null); setNotice(success); setActivity("Refreshing search rules…"); try { await reload(); } catch { setError("The rule was saved, but the list could not refresh. Retry to load current rules."); } }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Search sources could not be updated."); }
    finally { setBusy(false); setActivity(""); }
  }
  function edit(rule?: Rule) { setError(""); setDraft(rule ? { domain: rule.domain, display_name: rule.display_name, status: rule.status, category: rule.category, notes: rule.notes } : { ...blank }); }
  function fromDiscovery(item: Discovered, status: Draft["status"], trusted = false) { setDraft({ domain: item.domain, display_name: item.display_name, status, category: trusted ? "trusted" : item.category, notes: `Discovered at ${item.example_url}` }); }
  const visible = policy?.rules.filter((rule) => `${rule.domain} ${rule.display_name} ${rule.category} ${rule.notes}`.toLowerCase().includes(query.toLowerCase())) || [];
  const discoveries = policy?.discovered.filter(item => !policy.rules.some(rule => item.domain === rule.domain)) || [];
  return <section className="search-sources-panel" aria-labelledby="search-sources-title">
    <div className="search-sources-head"><div><p className="section-label">Live research</p><h2 id="search-sources-title">Search Sources</h2></div><Button variant="outline" onClick={() => edit()} disabled={busy}><Plus size={15}/> Add domain</Button></div>
    <div className="search-policy-line"><label htmlFor="search-policy-mode">Search mode</label><select id="search-policy-mode" value={policy?.mode || "credible_web"} disabled={!policy || busy} onChange={(event) => void act("PATCH", { mode: event.target.value }, "Search mode updated.")}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><p>{modeHelp[policy?.mode || "credible_web"]}</p></div>
    {activity && <p className="inline-progress" role="status"><LoaderCircle size={15} className="animate-spin"/>{activity}</p>}
    {error && <div className="resource-error" role="alert">{error}{!draft && <Button variant="outline" size="sm" onClick={() => { setError(""); setLoading(true); void reload().catch(() => setError("Search rules could not be loaded. Try again.")).finally(() => setLoading(false)); }}>Refresh rules</Button>}</div>}{notice && <p className="inline-success" role="status"><Check size={15}/>{notice}</p>}
    {policy ? <><div className="search-view-tabs" role="group" aria-label="Live search lists"><button type="button" className={view === "rules" ? "is-active" : ""} aria-pressed={view === "rules"} onClick={() => setView("rules")}>Domain rules <span>{policy.rules.length}</span></button><button type="button" className={view === "discovered" ? "is-active" : ""} aria-pressed={view === "discovered"} onClick={() => setView("discovered")}>Recently found <span>{discoveries.length}</span></button></div>
    {view === "rules" ? <><div className="search-sources-tools"><label>Find a website<Input value={query} onChange={(event) => { setQuery(event.target.value); setShownRules(8); }} placeholder="Search domain rules"/></label><span>{visible.length} shown</span></div><div className="search-rule-list">{visible.slice(0, shownRules).map(rule => <div className="search-rule" key={rule.id}><div><strong>{rule.display_name}</strong><small>{rule.domain}</small></div><span className={`search-rule-status search-rule-status-${rule.status}`}>{rule.status === "allowed" && rule.category === "trusted" ? "Trusted" : rule.status === "allowed" ? "Allowed" : rule.status === "blocked" ? "Blocked" : "Paused"}</span><Button size="sm" variant="ghost" onClick={() => edit(rule)}>Edit</Button></div>)}{!visible.length && <p className="empty-note">{query ? "No rules match this search." : "No custom rules yet."}</p>}</div>{visible.length > shownRules && <Button className="access-show-more" variant="outline" onClick={() => setShownRules(count => count + 8)}>Show more rules ({visible.length - shownRules} left)</Button>}</> : <div className="discovered-sources"><p>Review sites found during research. Trust gives a verified institution higher priority; Allow permits use without that priority.</p>{discoveries.slice(0, shownDiscoveries).map(item => <div className="discovered-source" key={item.domain}><div><strong>{item.display_name}</strong><small>{item.domain}</small></div><Button size="sm" variant="outline" onClick={() => fromDiscovery(item, "allowed", true)}>Trust</Button><Button size="sm" variant="outline" onClick={() => fromDiscovery(item, "allowed")}>Allow</Button><Button size="sm" variant="outline" onClick={() => fromDiscovery(item, "blocked")}>Block</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => void act("PATCH", { ignoreDomain: item.domain }, "Discovery ignored.")}>Ignore</Button></div>)}{!discoveries.length && <p className="empty-note">No new websites have been found.</p>}{discoveries.length > shownDiscoveries && <Button className="access-show-more" variant="outline" onClick={() => setShownDiscoveries(count => count + 5)}>Show more discoveries ({discoveries.length - shownDiscoveries} left)</Button>}</div>}</> : loading && <div className="website-rule-loading" role="status" aria-label="Loading search rules"><Skeleton className="h-4 w-1/2"/><Skeleton className="h-14 w-full"/><Skeleton className="h-14 w-full"/></div>}
    <Dialog open={!!draft} onOpenChange={(open) => { if (!open && !busy) setDraft(null); }}><DialogContent className="search-source-dialog"><DialogHeader><DialogTitle>{draft?.domain && policy?.rules.some((rule) => rule.domain === draft.domain) ? "Edit search domain" : "Add search domain"}</DialogTitle><DialogDescription>Rules apply to live search. A blocked domain cannot become answer evidence.</DialogDescription></DialogHeader>{draft && <div className="sheet-fields"><label>Website URL or domain<Input placeholder="example.org or https://example.org/page" value={draft.domain} onChange={(event) => setDraft({ ...draft, domain: event.target.value })} disabled={busy}/></label><label>Source name<Input value={draft.display_name} onChange={(event) => setDraft({ ...draft, display_name: event.target.value })} disabled={busy}/></label><label>Status<select value={draft.status === "allowed" && draft.category === "trusted" ? "trusted" : draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value === "trusted" ? "allowed" : event.target.value as Draft["status"], category: event.target.value === "trusted" ? "trusted" : draft.category === "trusted" ? "institutional" : draft.category })} disabled={busy}><option value="trusted">Trusted</option><option value="allowed">Allowed</option><option value="blocked">Blocked</option><option value="disabled">Temporarily disabled</option></select></label><label>Category<Input list="search-source-categories" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} disabled={busy}/><datalist id="search-source-categories"><option value="institutional"/><option value="academic"/><option value="primary_text"/><option value="publisher"/><option value="other"/></datalist></label><label>Notes<Textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} disabled={busy}/></label></div>}{error && <p className="form-error" role="alert">{error}</p>}<div className="search-source-actions"><Button variant="outline" onClick={() => setDraft(null)} disabled={busy}>Cancel</Button>{draft && policy?.rules.some((rule) => rule.domain === draft.domain) && <Button variant="ghost" disabled={busy} onClick={() => void act("DELETE", { domain: draft.domain }, "Rule removed.")}>Remove rule</Button>}<Button disabled={busy || !draft?.domain || !draft.display_name || !draft.category} onClick={() => void act("POST", draft, "Search source saved.")}>{busy ? "Saving…" : "Save rule"}</Button></div></DialogContent></Dialog>
  </section>;
}
