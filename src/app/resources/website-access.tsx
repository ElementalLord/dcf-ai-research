"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Globe2, LoaderCircle, Pencil, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import ConfirmResourceChange, { type PendingResourceChange } from "./confirm-resource-change";

type Scope = "EXACT_URL" | "PATH_PREFIX" | "DOMAIN";
type EvidenceStatus = "candidate" | "approved" | "rejected";
type Permission = "allow_live_search" | "allow_live_fetch" | "allow_ingestion";
type Rule = {
  id: string; display_name: string; domain: string; scope_type: Scope;
  exact_url: string | null; allowed_path_prefix: string | null;
  allow_live_search: boolean; allow_live_fetch: boolean; allow_ingestion: boolean;
  evidence_use_status: EvidenceStatus; is_active: boolean; notes: string | null;
};
type Draft = {
  id?: string; displayName: string; address: string; scopeType: Scope;
  allowLiveSearch: boolean; allowLiveFetch: boolean; allowIngestion: boolean;
  evidenceUseStatus: EvidenceStatus; isActive: boolean; notes: string;
};
const emptyDraft: Draft = { displayName: "", address: "", scopeType: "EXACT_URL", allowLiveSearch: false, allowLiveFetch: false, allowIngestion: false, evidenceUseStatus: "candidate", isActive: true, notes: "" };
const permissionFields: Array<{ key: Permission; label: string; api: string }> = [
  { key: "allow_live_search", label: "Search", api: "allowLiveSearch" },
  { key: "allow_live_fetch", label: "Read", api: "allowLiveFetch" },
  { key: "allow_ingestion", label: "Import", api: "allowIngestion" },
];

function addressFor(rule: Rule) {
  return rule.exact_url || `https://${rule.domain}${rule.allowed_path_prefix || ""}`;
}
function scopeLabel(scope: Scope) {
  return scope === "EXACT_URL" ? "Page" : scope === "PATH_PREFIX" ? "Section" : "Site";
}
function locationLabel(rule: Rule) {
  if (rule.scope_type === "DOMAIN") return "Whole website";
  if (rule.scope_type === "PATH_PREFIX") return rule.allowed_path_prefix || "/";
  try {
    const url = new URL(rule.exact_url || "");
    return `${url.pathname}${url.search}` || "/";
  } catch { return rule.exact_url || "Page"; }
}
async function request(method: "GET" | "POST" | "PATCH", body?: unknown) {
  const response = await fetch("/api/corpus/source-access", { method, cache: "no-store", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : payload.error?.message || "Website permissions could not be saved.");
  return payload as { rules?: Rule[]; rule?: Rule };
}

export default function WebsiteAccess() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [shownSites, setShownSites] = useState(8);
  const [query, setQuery] = useState("");
  const [recordView, setRecordView] = useState<"current" | "rejected">("current");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<PendingResourceChange | null>(null);
  const load = useCallback(async () => { const payload = await request("GET"); setRules(payload.rules || []); }, []);
  useEffect(() => {
    void request("GET")
      .then(payload => setRules(payload.rules || []))
      .catch(() => setError("Website permissions could not be loaded. Try again."))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const visibleRules = rules.filter(rule => recordView === "rejected" ? rule.evidence_use_status === "rejected" : rule.evidence_use_status !== "rejected");
    const matches = needle ? visibleRules.filter(rule => `${rule.display_name} ${rule.domain} ${rule.exact_url || ""} ${rule.allowed_path_prefix || ""}`.toLowerCase().includes(needle)) : visibleRules;
    const byDomain = new Map<string, Rule[]>();
    for (const rule of matches) {
      const siteRules = byDomain.get(rule.domain);
      if (siteRules) siteRules.push(rule); else byDomain.set(rule.domain, [rule]);
    }
    return [...byDomain.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [query, recordView, rules]);
  const currentRules = rules.filter(rule => rule.evidence_use_status !== "rejected");
  const rejectedCount = rules.length - currentRules.length;
  const siteCount = new Set(currentRules.map(rule => rule.domain)).size;

  function edit(rule?: Rule) {
    setError(""); setNotice("");
    setDraft(rule ? {
      id: rule.id, displayName: rule.display_name, address: addressFor(rule), scopeType: rule.scope_type,
      allowLiveSearch: rule.allow_live_search, allowLiveFetch: rule.allow_live_fetch, allowIngestion: rule.allow_ingestion,
      evidenceUseStatus: rule.evidence_use_status, isActive: rule.is_active, notes: rule.notes || "",
    } : { ...emptyDraft });
  }
  function toggleGroup(domain: string) {
    setExpanded(current => current.has(domain) ? new Set() : new Set([domain]));
  }
  async function quickUpdate(rule: Rule, patch: Record<string, boolean | EvidenceStatus>, label: string) {
    if (busy || pendingId) return false;
    setPendingId(rule.id); setError(""); setNotice("");
    try {
      const result = await request("PATCH", { id: rule.id, ...patch });
      try { await load(); }
      catch {
        if (result.rule) setRules(current => current.map(item => item.id === rule.id ? result.rule! : item));
        setError("Permission saved, but the list could not refresh. Refresh to load current rules.");
      }
      if (patch.evidenceUseStatus) setRecordView(patch.evidenceUseStatus === "rejected" ? "rejected" : "current");
      setNotice(`${label} updated for ${rule.display_name}.`);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Permission could not be saved. Try again.");
      return false;
    } finally { setPendingId(null); }
  }
  async function save() {
    if (!draft || busy) return false;
    setError(""); setNotice("");
    let parsed: URL;
    try {
      parsed = new URL(/^https?:\/\//i.test(draft.address.trim()) ? draft.address.trim() : `https://${draft.address.trim()}`);
      if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) throw new Error();
    } catch { setError("Enter a valid website or page URL."); return false; }
    setBusy(true);
    try {
      await request(draft.id ? "PATCH" : "POST", {
        ...(draft.id ? { id: draft.id } : {}),
        displayName: draft.displayName.trim() || parsed.hostname,
        domain: parsed.hostname,
        scopeType: draft.scopeType,
        exactUrl: draft.scopeType === "EXACT_URL" ? parsed.toString() : null,
        allowedPathPrefix: draft.scopeType === "PATH_PREFIX" ? parsed.pathname : null,
        allowLiveSearch: draft.allowLiveSearch,
        allowLiveFetch: draft.allowLiveFetch,
        allowIngestion: draft.allowIngestion,
        evidenceUseStatus: draft.evidenceUseStatus,
        isActive: draft.isActive,
        notes: draft.notes.trim() || null,
        approvalOrigin: "human_manual",
      });
      setDraft(null);
      setRecordView(draft.evidenceUseStatus === "rejected" ? "rejected" : "current");
      setExpanded(current => new Set(current).add(parsed.hostname));
      setNotice(draft.id ? "Website access updated." : "Website access added.");
      try { await load(); }
      catch { setError("Access was saved, but the list could not refresh. Retry to load current rules."); }
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Website access could not be saved."); return false; }
    finally { setBusy(false); }
  }
  function queueChange(change: PendingResourceChange) { setError(""); setPending(change); }
  async function confirmChange() {
    if (!pending || busy || pendingId) return;
    if (await pending.run()) setPending(null);
  }

  return <section className="website-access-panel" aria-labelledby="website-access-title">
    <div className="website-panel-head"><div><h2 id="website-access-title">Page access</h2></div><Button variant="outline" onClick={() => edit()}><Plus size={15}/> Add website</Button></div>
    <div className="website-record-views" role="group" aria-label="Website access records"><button type="button" className={recordView === "current" ? "is-active" : ""} aria-pressed={recordView === "current"} onClick={() => setRecordView("current")}>Current <span>{currentRules.length}</span></button><button type="button" className={recordView === "rejected" ? "is-active" : ""} aria-pressed={recordView === "rejected"} onClick={() => setRecordView("rejected")}>Rejected <span>{rejectedCount}</span></button></div>
    <div className="website-list-toolbar"><label className="website-search"><Search size={16} aria-hidden="true"/><Input value={query} onChange={event => { setQuery(event.target.value); setShownSites(8); }} placeholder="Find a page or site" aria-label="Find a page or site"/></label><span>{loading ? "Loading…" : recordView === "rejected" ? `${rejectedCount} rejected rules` : `${currentRules.length} ${currentRules.length === 1 ? "rule" : "rules"} · ${siteCount} ${siteCount === 1 ? "site" : "sites"}`}</span></div>
    {notice && <p className="inline-success" role="status"><Check size={15}/>{notice}</p>}
    {error && !draft && <div className="resource-error" role="alert">{error}<Button variant="outline" size="sm" onClick={() => { setError(""); setLoading(true); void load().catch(() => setError("Website permissions could not be loaded. Try again.")).finally(() => setLoading(false)); }}>Refresh</Button></div>}
    {loading ? <div className="website-rule-loading" role="status" aria-label="Loading website access"><Skeleton className="h-10 w-full"/><Skeleton className="h-10 w-full"/></div> : groups.length ? <><div className="website-groups">{groups.slice(0, shownSites).map(([domain, items]) => {
      const open = expanded.has(domain);
      return <div className="website-group" key={domain}>
        <button type="button" className="website-group-toggle" aria-expanded={open} aria-controls={`website-group-${domain}`} onClick={() => toggleGroup(domain)}><Globe2 size={17} aria-hidden="true"/><strong>{domain}</strong><span>{items.length} {items.length === 1 ? "rule" : "rules"}</span><ChevronDown size={16} className={open ? "website-chevron-open" : ""} aria-hidden="true"/></button>
        <div className="website-group-entries" id={`website-group-${domain}`} role="group" aria-label={`Permissions for ${domain}`} hidden={!open}>{items.map(rule => <div className="website-compact-rule" key={rule.id}>
          <button type="button" className="website-rule-name" onClick={() => edit(rule)} title={addressFor(rule)}><strong>{rule.display_name}</strong><small>{scopeLabel(rule.scope_type)} · {locationLabel(rule)}</small></button>
          <div className="website-quick-actions" aria-label={`Permissions for ${rule.display_name}`}>
            {permissionFields.map(field => <Button key={field.key} type="button" variant="outline" size="sm" className={`website-permission-chip ${rule[field.key] && rule.is_active ? "website-permission-on" : ""}`} aria-pressed={rule[field.key] && rule.is_active} aria-label={`${field.label} ${rule.display_name}`} disabled={busy || !!pendingId || !rule.is_active} onClick={() => queueChange({ title: `Change ${field.label} permission?`, description: `${field.label} will be ${rule[field.key] ? "turned off" : "turned on"} for ${rule.display_name}.`, confirmLabel: `Update ${field.label}`, run: () => quickUpdate(rule, { [field.api]: !rule[field.key] }, field.label) })}>{rule[field.key] && rule.is_active && <Check size={12} aria-hidden="true"/>}{field.label}</Button>)}
            <label className="website-evidence-control"><span>Evidence</span><select value={rule.evidence_use_status} disabled={busy || !!pendingId || !rule.is_active} aria-label={`Evidence use for ${rule.display_name}`} onChange={event => { const nextStatus = event.target.value as EvidenceStatus; queueChange({ title: "Change evidence use?", description: `${rule.display_name} will be marked ${nextStatus === "candidate" ? "Needs review" : nextStatus}.`, confirmLabel: "Update evidence use", run: () => quickUpdate(rule, { evidenceUseStatus: nextStatus }, "Evidence use") }); }}><option value="candidate">Review</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></label>
            {pendingId === rule.id && <LoaderCircle size={16} className="animate-spin" aria-label="Saving permission"/>}
            <Button type="button" variant="ghost" size="sm" className="website-edit-rule" onClick={() => edit(rule)} disabled={busy || !!pendingId} aria-label={`Edit ${rule.display_name}`}><Pencil size={15}/><span>Edit</span></Button>
          </div>
          {!rule.is_active && <span className="website-paused">Paused</span>}
        </div>)}</div>
      </div>;
    })}</div>{groups.length > shownSites && <Button className="website-show-more" variant="outline" onClick={() => setShownSites(count => count + 8)}>Show more sites ({groups.length - shownSites} left)</Button>}</> : <p className="resource-empty">{query ? "No pages match that search." : recordView === "rejected" ? "No rejected website rules." : "No page rules yet. Add a website to begin."}</p>}
    <Dialog open={!!draft} onOpenChange={open => { if (!open && !busy && !pending) { setDraft(null); setError(""); } }}><DialogContent className="website-access-dialog"><DialogHeader><DialogTitle>{draft?.id ? "Edit page access" : "Add website access"}</DialogTitle><DialogDescription>Type any website or page address, then choose how broadly access applies.</DialogDescription></DialogHeader>{draft && <div className="website-access-form"><div className="website-form-grid"><label>Website or page URL<Input value={draft.address} onChange={event => setDraft({ ...draft, address: event.target.value })} placeholder="https://example.org/article" disabled={busy}/></label><label>Name<Input value={draft.displayName} onChange={event => setDraft({ ...draft, displayName: event.target.value })} placeholder="Name shown in the list" disabled={busy}/></label></div><div className="website-form-grid"><fieldset className="website-scope-choices"><legend>Applies to</legend>{([{"value":"EXACT_URL","label":"This page","help":"Only the address entered above"},{"value":"PATH_PREFIX","label":"This section","help":"The entered path and pages below it"},{"value":"DOMAIN","label":"Whole website","help":"Any page on this site"}] as const).map(option => <label key={option.value} className={draft.scopeType === option.value ? "is-selected" : ""}><input type="radio" name="website-scope" value={option.value} checked={draft.scopeType === option.value} onChange={() => setDraft({ ...draft, scopeType: option.value })} disabled={busy}/><span><strong>{option.label}</strong><small>{option.help}</small></span></label>)}</fieldset><label>Evidence use<Select value={draft.evidenceUseStatus} onValueChange={value => setDraft({ ...draft, evidenceUseStatus: value as EvidenceStatus })} disabled={busy}><SelectTrigger><SelectValue>{draft.evidenceUseStatus === "approved" ? "Approved" : draft.evidenceUseStatus === "rejected" ? "Rejected" : "Needs review"}</SelectValue></SelectTrigger><SelectContent><SelectItem value="candidate">Needs review</SelectItem><SelectItem value="approved">Approved</SelectItem><SelectItem value="rejected">Rejected</SelectItem></SelectContent></Select></label></div><div className="website-permission-options"><p>Allow</p><label><input type="checkbox" checked={draft.allowLiveSearch} onChange={event => setDraft({ ...draft, allowLiveSearch: event.target.checked })} disabled={busy}/> Search</label><label><input type="checkbox" checked={draft.allowLiveFetch} onChange={event => setDraft({ ...draft, allowLiveFetch: event.target.checked })} disabled={busy}/> Read</label><label><input type="checkbox" checked={draft.allowIngestion} onChange={event => setDraft({ ...draft, allowIngestion: event.target.checked })} disabled={busy}/> Import</label></div><label className="website-active-option"><input type="checkbox" checked={draft.isActive} onChange={event => setDraft({ ...draft, isActive: event.target.checked })} disabled={busy}/> Active</label><details className="website-extra-fields"><summary>Notes{draft.notes ? " (saved)" : ""}</summary><label>Notes (optional)<Textarea value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} disabled={busy}/></label></details></div>}{error && <p className="form-error" role="alert">{error}</p>}<div className="website-access-actions"><Button type="button" variant="outline" disabled={busy} onClick={() => setDraft(null)}>Cancel</Button><Button type="button" disabled={busy || !draft?.address.trim()} onClick={() => queueChange({ title: draft?.id ? "Save page access changes?" : "Add this website access rule?", description: `${draft?.displayName || draft?.address || "This website"} will use the selected scope, evidence setting, and permissions.`, confirmLabel: draft?.id ? "Save changes" : "Add access", run: save })}>{busy && <LoaderCircle className="animate-spin" size={15}/>} {busy ? "Saving…" : "Save access"}</Button></div></DialogContent></Dialog>
    <ConfirmResourceChange pending={pending} busy={busy || !!pendingId} error={error} onCancel={() => { setPending(null); setError(""); }} onConfirm={() => void confirmChange()}/>
  </section>;
}
