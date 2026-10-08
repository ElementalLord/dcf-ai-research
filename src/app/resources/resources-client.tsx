"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, Check, FileText, LibraryBig, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

type Person = { id: string; canonical_name: string };
type Evidence = { id: string; relationship: string; evidence_excerpt: string | null; page_or_section: string | null; sources: { id: string; title: string; author: string | null; url: string | null } | null };
type ChunkLink = { relationship: string; source_chunks: { id: string; chunk_text: string; page_or_section: string | null; textual_layer: string | null; sources: { id: string; title: string; url: string | null } | null } | null };
type Claim = { id: string; claim_text: string; claim_kind: string; certainty: string; review_status: string; approval_origin: string | null; approved_by_label: string | null; evidence_type: string | null; researcher_notes: string | null; parameter_fields: { label: string } | null; claim_sources: Evidence[]; claim_chunks: ChunkLink[]; epistemics: { epistemic_type: string | null; proposed_type: string; contract_status: string; contract_basis: string | null } | null; claim_reviews: Array<{ reviewer_name: string; decision: string; notes: string | null; reviewed_at: string }> };
type Source = { id: string; title: string; author: string | null; publisher_or_institution: string | null; source_type: string; url: string | null; citation: string | null; textual_layer: string | null; source_status: string; approval_origin: string | null; approval_note: string | null; approved_by_label: string | null; ingestion_status: string; rights_or_access_note: string | null; publication_year: number | null; updated_at: string | null };
type Detail = { kind: "source"; item: Source } | { kind: "claim"; item: Claim };
type ReviewAction = "approved" | "candidate" | "needs_review" | "rejected";
type Confirm = { kind: "delete" } | { kind: "review"; status: ReviewAction };
type ResearchOptions = { personalities: Array<Person & { category_id: string | null }>; categories: Array<{ id: string; parameters: Array<{ id: string; name: string; parameter_fields: Array<{ id: string; label: string }> }> }> };
const json = { "Content-Type": "application/json" };
const human = (value: string) => value.replaceAll("_", " ");
const fieldNames: Record<string, string> = { title: "Title *", author: "Author", publisher_or_institution: "Publisher or institution", source_type: "Source type *", url: "Original URL", citation: "Citation", textual_layer: "Textual layer" };
const friendlyError = (error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  if (/unauthorized|forbidden|admin|token/i.test(message)) return "Your Resources session has ended. Sign in again to continue.";
  if (/review|approved/i.test(message)) return "Return this record to review before editing it.";
  if (/linked|provenance|unlinked/i.test(message)) return "This record has linked evidence and cannot be removed.";
  if (/duplicate|already exists/i.test(message)) return "A source with this URL already exists. Check the source list.";
  return "The action could not be completed. Check the fields and try again.";
};
async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : data.error?.message || `Request failed (${response.status})`);
  return data as T;
}

export default function ResourcesClient({ authorized, personalities, loadError }: { authorized: boolean; personalities: Person[]; loadError?: string }) {
  const [token, setToken] = useState("");
  const [personId, setPersonId] = useState(personalities[0]?.id || "");
  const [tab, setTab] = useState("sources");
  const [sources, setSources] = useState<Source[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [chunks, setChunks] = useState<Array<{ id: string; chunk_text: string; page_or_section: string | null; textual_layer: string | null }>>([]);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [loading, setLoading] = useState(authorized);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(loadError ? "People could not be loaded. Refresh Resources to try again." : "");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [reviewer, setReviewer] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [passage, setPassage] = useState("");
  const [passageLocator, setPassageLocator] = useState("");
  const [showPassage, setShowPassage] = useState(false);
  const [newClaim, setNewClaim] = useState(false);
  const [claimOptions, setClaimOptions] = useState<ResearchOptions | null>(null);
  const [claimDraft, setClaimDraft] = useState({ fieldId: "", sourceId: "", text: "", kind: "traditional_account", certainty: "unknown", excerpt: "", locator: "", notes: "" });
  const sheetScroll = useRef<HTMLDivElement>(null);
  const selectedName = personalities.find(p => p.id === personId)?.canonical_name || "this person";
  const sourceById = useMemo(() => new Map(sources.map(source => [source.id, source])), [sources]);
  const linkedClaims = useMemo(() => {
    const map = new Map<string, Claim[]>();
    for (const claim of claims) {
      const ids = new Set([...claim.claim_sources.map(link => link.sources?.id), ...claim.claim_chunks.map(link => link.source_chunks?.sources?.id)]);
      for (const id of ids) if (id) map.set(id, [...(map.get(id) || []), claim]);
    }
    return map;
  }, [claims]);
  const filteredSources = sources.filter(source => {
    const search = `${source.title} ${source.author || ""} ${source.publisher_or_institution || ""} ${source.source_type} ${source.citation || ""}`.toLowerCase();
    return search.includes(query.trim().toLowerCase()) && (status === "all" || source.source_status === status);
  });
  const filteredClaims = claims.filter(claim => {
    const search = `${claim.claim_text} ${claim.parameter_fields?.label || ""} ${claim.claim_kind} ${claim.claim_sources.map(link => link.sources?.title).join(" ")}`.toLowerCase();
    return search.includes(query.trim().toLowerCase()) && (status === "all" || claim.review_status === status);
  });
  const availableStatuses = tab === "sources" ? ["all", "candidate", "approved", "rejected"] : ["all", "draft", "needs_review", "approved", "rejected"];
  const activeList = tab === "sources" ? filteredSources : filteredClaims;
  const pageCount = Math.max(1, Math.ceil(activeList.length / 25));
  const currentPage = Math.min(page, pageCount);
  const visibleSources = filteredSources.slice((currentPage - 1) * 25, currentPage * 25);
  const visibleClaims = filteredClaims.slice((currentPage - 1) * 25, currentPage * 25);
  const categoryId = claimOptions?.personalities.find(person => person.id === personId)?.category_id;
  const fieldOptions = claimOptions?.categories.find(category => category.id === categoryId)?.parameters.flatMap(parameter => parameter.parameter_fields.map(field => ({ ...field, group: parameter.name }))) || [];
  const load = useCallback(async (id: string) => {
    const result = await api<{ sources: Source[]; claims: Claim[] }>(`/api/resources?personalityId=${encodeURIComponent(id)}`);
    setSources(result.sources); setClaims(result.claims);
  }, []);
  useEffect(() => {
    if (!authorized || !personId) return;
    let active = true;
    void api<{ sources: Source[]; claims: Claim[] }>(`/api/resources?personalityId=${encodeURIComponent(personId)}`)
      .then(result => { if (active) { setSources(result.sources); setClaims(result.claims); setError(""); setLoading(false); } })
      .catch(() => { if (active) { setError("Resources could not be loaded. Try again."); setLoading(false); } });
    return () => { active = false; };
  }, [authorized, personId]);
  useEffect(() => {
    if (detail?.kind !== "source") return;
    let active = true;
    void api<{ chunks: typeof chunks }>(`/api/corpus/chunks?sourceId=${detail.item.id}`)
      .then(data => { if (active) { setChunks(data.chunks); setChunksLoading(false); } })
      .catch(() => { if (active) { setChunksLoading(false); setError("Passages could not be loaded. Reopen the source to retry."); } });
    return () => { active = false; };
  }, [detail]);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  function choosePerson(id: string) { setPersonId(id); setDetail(null); setCreating(false); setQuery(""); setStatus("all"); setPage(1); setLoading(true); setError(""); }
  function open(item: Detail) { sheetScroll.current?.scrollTo({ top: 0 }); setError(""); setNotice(""); setCreating(false); setEditing(false); setShowPassage(false); setPassage(""); setPassageLocator(""); setChunks([]); setChunksLoading(item.kind === "source"); setDetail(item); setDraft(Object.fromEntries(Object.entries(item.item).map(([key, value]) => [key, typeof value === "string" ? value : ""]))); }
  function startCreate() { setDetail(null); setCreating(true); setEditing(true); setError(""); setDraft({ title: "", author: "", source_type: "other", url: "", citation: "" }); }
  async function startClaim() {
    setError(""); setNewClaim(true); setClaimOptions(null);
    setClaimDraft({ fieldId: "", sourceId: "", text: "", kind: "traditional_account", certainty: "unknown", excerpt: "", locator: "", notes: "" });
    try { setClaimOptions(await api<ResearchOptions>("/api/research/options")); }
    catch { setError("Claim form options could not be loaded. Close the form and try again."); }
  }
  function closeSheet() { if (busy) return; setDetail(null); setCreating(false); setEditing(false); setError(""); setShowPassage(false); }
  function cancelEdit() {
    if (!detail) return;
    setDraft(Object.fromEntries(Object.entries(detail.item).map(([key, value]) => [key, typeof value === "string" ? value : ""])));
    setEditing(false);
    setError("");
  }
  async function mutate(action: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await action();
      await load(personId);
      setDetail(null); setCreating(false); setNewClaim(false); setConfirm(null); setNotice(success); setShowPassage(false);
    } catch (cause) { setError(friendlyError(cause)); }
    finally { setBusy(false); }
  }
  async function signIn(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try { await api("/api/admin/session", { method: "POST", headers: json, body: JSON.stringify({ token }) }); window.location.reload(); }
    catch { setError("The token was not accepted. Check it and try again."); setBusy(false); }
  }
  async function signOut() {
    if (busy) return;
    setBusy(true);
    try { await api("/api/admin/session", { method: "DELETE" }); window.location.reload(); }
    catch { setError("Could not sign out. Try again."); setBusy(false); }
  }
  if (!authorized) return <main className="resources-page page-shell"><div className="page-kicker">03 / RESOURCES</div><div className="resources-intro"><p className="section-label">Restricted collection</p><h1>Research resources.</h1><p>Authorized researchers can manage the sources and claims behind DCF answers.</p><form className="login-form" onSubmit={signIn}><label htmlFor="admin-token">Administrator token</label><Input id="admin-token" type="password" autoComplete="current-password" value={token} onChange={event => setToken(event.target.value)} required/><Button disabled={busy || !token.trim()}>{busy ? "Opening…" : "Open Resources"}</Button></form>{error && <p className="form-error" role="alert">{error}</p>}</div></main>;
  const source = detail?.kind === "source" ? detail.item : null;
  const claim = detail?.kind === "claim" ? detail.item : null;
  const locked = source?.source_status === "approved" || claim?.review_status === "approved";
  const canDelete = source?.source_status === "candidate" && !chunks.length && !(linkedClaims.get(source.id)?.length) || claim?.review_status === "draft";
  const saveSource = () => mutate(() => api("/api/resources", { method: "PATCH", headers: json, body: JSON.stringify({ kind: "source", id: source?.id, fields: { title: draft.title?.trim(), author: draft.author || null, publisher_or_institution: draft.publisher_or_institution || null, source_type: draft.source_type?.trim(), url: draft.url || null, citation: draft.citation || null, textual_layer: draft.textual_layer || null } }) }), "Source saved. Its details have been refreshed.");
  const saveClaim = () => mutate(() => api("/api/resources", { method: "PATCH", headers: json, body: JSON.stringify({ kind: "claim", id: claim?.id, fields: { claim_text: draft.claim_text?.trim(), certainty: draft.certainty || "unknown", researcher_notes: draft.researcher_notes || null } }) }), "Claim updated. Its details have been refreshed.");
  const review = (next: ReviewAction) => { setReviewer(""); setReviewNote(""); setConfirm({ kind: "review", status: next }); };
  async function submitReview() {
    if (!detail || !confirm || confirm.kind !== "review") return;
    const status = confirm.status;
    await mutate(() => api(detail.kind === "source" ? "/api/corpus/sources" : "/api/review/update", { method: detail.kind === "source" ? "PATCH" : "POST", headers: json, body: JSON.stringify(detail.kind === "source" ? { sourceId: detail.item.id, status, approvedByLabel: reviewer.trim(), approvalOrigin: "human_manual", approvalNote: reviewNote.trim() || undefined } : { claimId: detail.item.id, status, reviewerName: reviewer.trim(), approvalOrigin: "human_manual", notes: reviewNote.trim() || undefined }) }), status === "approved" ? "Review approved." : status === "rejected" ? "Record rejected." : "Record returned to review. You can now edit it.");
  }
  return <main className="resources-page page-shell"><div className="page-kicker">03 / RESOURCES</div><div className="resource-heading"><div><p className="section-label">Research library</p><h1>Resources.</h1><p>Select a person, then inspect their sources and claims.</p></div><Button variant="ghost" disabled={busy} onClick={signOut}>Sign out</Button></div>
    {notice && <div className="resource-notice" role="status"><Check size={16}/>{notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss message"><X size={15}/></button></div>}
    {error && !detail && !creating && <div className="resource-error" role="alert">{error}<Button variant="outline" size="sm" onClick={() => { setLoading(true); void load(personId).then(() => { setError(""); setLoading(false); }).catch(() => { setError("Resources could not be loaded. Try again."); setLoading(false); }); }}>Retry</Button></div>}
    <div className="resource-workspace"><aside className="people-sidebar"><p className="section-label">People</p><div className="people-list">{personalities.map(person => <button type="button" key={person.id} aria-current={person.id === personId ? "true" : undefined} disabled={busy || loading} onClick={() => choosePerson(person.id)}>{person.canonical_name}</button>)}</div><label className="mobile-person">Person<Select value={personId} onValueChange={value => choosePerson(value || "")} disabled={busy || loading}><SelectTrigger aria-label="Choose person"><SelectValue>{selectedName}</SelectValue></SelectTrigger><SelectContent>{personalities.map(person => <SelectItem key={person.id} value={person.id}>{person.canonical_name}</SelectItem>)}</SelectContent></Select></label></aside>
      <section className="resource-main" aria-label={`${selectedName} resources`}><div className="workspace-title"><div><p className="section-label">Selected person</p><h2>{selectedName}</h2><p>Review source records and the claims supported by them.</p></div><Button onClick={tab === "sources" ? startCreate : () => void startClaim()} disabled={!personId || loading}><Plus size={15}/> Add {tab === "sources" ? "source" : "claim"}</Button></div>
        <Tabs value={tab} onValueChange={value => { setTab(value); setStatus("all"); setPage(1); }} className="resource-tabs"><TabsList variant="line"><TabsTrigger value="sources">Sources <span>{loading ? "…" : sources.length}</span></TabsTrigger><TabsTrigger value="claims">Claims <span>{loading ? "…" : claims.length}</span></TabsTrigger></TabsList>
          <div className="resource-filters"><label className="search-field"><Search size={16}/><Input value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder={`Search ${tab}`} aria-label={`Search ${tab}`}/></label><label className="status-field">Review status<Select value={status} onValueChange={value => { setStatus(value || "all"); setPage(1); }}><SelectTrigger><SelectValue>{status === "all" ? "All statuses" : human(status)}</SelectValue></SelectTrigger><SelectContent>{availableStatuses.map(value => <SelectItem key={value} value={value}>{value === "all" ? "All statuses" : human(value)}</SelectItem>)}</SelectContent></Select></label>{(query || status !== "all") && <Button variant="ghost" size="sm" onClick={() => { setQuery(""); setStatus("all"); setPage(1); }}>Clear filters</Button>}</div>
          <TabsContent value="sources">{loading ? <LoadingRows kind="sources"/> : filteredSources.length ? <Table className="research-table"><TableHeader><TableRow><TableHead>Source</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Claims</TableHead><TableHead>Updated</TableHead></TableRow></TableHeader><TableBody>{visibleSources.map(item => <TableRow key={item.id}><TableCell><button type="button" className="table-open" aria-label={`View source ${item.title}`} onClick={() => open({ kind: "source", item })}><LibraryBig size={16}/><span><strong>{item.title}</strong><small>{[item.author, item.publisher_or_institution].filter(Boolean).join(" · ") || "No publication details"}</small></span><span className="table-open-action">View</span><ArrowUpRight size={14}/></button></TableCell><TableCell>{human(item.source_type)}</TableCell><TableCell><span className="table-status">{human(item.source_status)}</span></TableCell><TableCell>{linkedClaims.get(item.id)?.length || 0}</TableCell><TableCell>{item.updated_at ? new Date(item.updated_at).toLocaleDateString() : "Not recorded"}</TableCell></TableRow>)}</TableBody></Table> : <EmptyList filtered={!!query || status !== "all"} kind="sources" person={selectedName} clear={() => { setQuery(""); setStatus("all"); setPage(1); }} add={startCreate}/>}</TabsContent>
          <TabsContent value="claims">{loading ? <LoadingRows kind="claims"/> : filteredClaims.length ? <Table className="research-table"><TableHeader><TableRow><TableHead>Claim</TableHead><TableHead>Parameter</TableHead><TableHead>Evidence</TableHead><TableHead>Review</TableHead></TableRow></TableHeader><TableBody>{visibleClaims.map(item => <TableRow key={item.id}><TableCell><button type="button" className="table-open" aria-label={`View claim ${item.claim_text}`} onClick={() => open({ kind: "claim", item })}><FileText size={16}/><span><strong>{item.claim_text}</strong></span><span className="table-open-action">View</span><ArrowUpRight size={14}/></button></TableCell><TableCell>{item.parameter_fields?.label || "Unassigned"}</TableCell><TableCell>{item.claim_sources.length + item.claim_chunks.length} links</TableCell><TableCell><span className="table-status">{human(item.review_status)}</span></TableCell></TableRow>)}</TableBody></Table> : <EmptyList filtered={!!query || status !== "all"} kind="claims" person={selectedName} clear={() => { setQuery(""); setStatus("all"); setPage(1); }} add={() => void startClaim()}/>}</TabsContent>
          {!loading && activeList.length > 25 && <div className="resource-pagination"><span>Showing {(currentPage - 1) * 25 + 1}–{Math.min(currentPage * 25, activeList.length)} of {activeList.length}</span><div><Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</Button><span>Page {currentPage} of {pageCount}</span><Button variant="outline" size="sm" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</Button></div></div>}
        </Tabs></section></div>
    <Sheet open={!!detail || creating} onOpenChange={open => { if (!open) closeSheet(); }}><SheetContent className="resource-sheet"><SheetHeader><SheetTitle>{creating ? "Add source" : source ? source.title : claim ? "Claim detail" : "Resource detail"}</SheetTitle><SheetDescription>{creating ? `Create a candidate source for ${selectedName}.` : source ? `${selectedName} · Source record` : `${selectedName} · Claim and evidence`}</SheetDescription></SheetHeader><div className="resource-sheet-scroll" ref={sheetScroll}>
      {detail && <Button variant="ghost" size="sm" className="sheet-back" onClick={closeSheet}><ArrowLeft size={15}/> Back to {tab}</Button>}
      {(creating || source) && <>{creating || editing ? <div className="sheet-fields">{(["title", "author", "publisher_or_institution", "source_type", "url", "citation", "textual_layer"] as const).filter(key => !creating || ["title", "author", "source_type", "url", "citation"].includes(key)).map(key => <label key={key}>{fieldNames[key]}<Input value={draft[key] || ""} onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))} disabled={busy} required={key === "title" || key === "source_type"} aria-invalid={key === "title" && !!draft.title && draft.title.trim().length < 2}/></label>)}</div> : source && <dl className="detail-facts detail-primary"><div><dt>Author</dt><dd>{source.author || "Not recorded"}</dd></div><div><dt>Publisher</dt><dd>{source.publisher_or_institution || "Not recorded"}</dd></div><div><dt>Source type</dt><dd>{human(source.source_type)}</dd></div><div><dt>Citation</dt><dd>{source.citation || "Not recorded"}</dd></div><div><dt>Textual layer</dt><dd>{source.textual_layer || "Not recorded"}</dd></div></dl>}{source && <><dl className="detail-facts"><div><dt>Review</dt><dd>{human(source.source_status)}</dd></div><div><dt>Review note</dt><dd>{source.approval_note || "Not specified"}</dd></div><div><dt>Rights / access</dt><dd>{source.rights_or_access_note || "Not specified"}</dd></div></dl>{source.url && <a className="resource-external" href={source.url} target="_blank" rel="noreferrer">Open original source <ArrowUpRight size={15}/></a>}<h3 className="detail-section-title">Linked claims <span>{linkedClaims.get(source.id)?.length || 0}</span></h3>{(linkedClaims.get(source.id) || []).map(item => <button className="related-record" type="button" key={item.id} onClick={() => open({ kind: "claim", item })}>{item.claim_text}<ArrowUpRight size={14}/></button>)}{!linkedClaims.get(source.id)?.length && <p className="empty-note">No claims currently link to this source.</p>}<h3 className="detail-section-title">Passages <span>{chunks.length}</span></h3>{chunksLoading ? <p className="empty-note">Loading passages…</p> : chunks.map(chunk => <article className="passage" key={chunk.id}><small>{[chunk.page_or_section, chunk.textual_layer].filter(Boolean).join(" · ") || "Unlocated passage"}</small><p>{chunk.chunk_text}</p></article>)}{!chunksLoading && !chunks.length && <p className="empty-note">No passages have been added to this source.</p>}{source.source_status !== "approved" && <div className="passage-add"><Button variant="outline" size="sm" onClick={() => setShowPassage(value => !value)}>{showPassage ? "Cancel" : "Add passage"}</Button>{showPassage && <div className="sheet-fields"><label>Page or section (optional)<Input value={passageLocator} onChange={event => setPassageLocator(event.target.value)} maxLength={300} placeholder="Where this passage appears" disabled={busy}/></label><label>Passage text<Textarea value={passage} onChange={event => setPassage(event.target.value)} placeholder="Paste source text here" disabled={busy}/></label><p className="field-help">This adds text to the source and makes it available for research review.</p><Button disabled={busy || !passage.trim()} onClick={() => mutate(() => api("/api/corpus/ingest", { method: "POST", headers: json, body: JSON.stringify({ sourceId: source.id, personalityIds: [personId], mode: "text", text: passage, pageOrSection: passageLocator || null, append: true }) }), "Passage added to the source.")}>{busy ? "Adding…" : "Add passage"}</Button></div>}</div>}</>}</>}
      {claim && <>{editing ? <div className="sheet-fields"><label>Claim text *<Textarea value={draft.claim_text || ""} onChange={event => setDraft(current => ({ ...current, claim_text: event.target.value }))} disabled={busy}/></label><label>Certainty<Select value={draft.certainty || "unknown"} onValueChange={value => setDraft(current => ({ ...current, certainty: value || "unknown" }))} disabled={busy}><SelectTrigger><SelectValue>{human(draft.certainty || "unknown")}</SelectValue></SelectTrigger><SelectContent>{["unknown", "high", "medium", "low"].map(value => <SelectItem key={value} value={value}>{human(value)}</SelectItem>)}</SelectContent></Select></label><label>Research notes<Textarea value={draft.researcher_notes || ""} onChange={event => setDraft(current => ({ ...current, researcher_notes: event.target.value }))} disabled={busy}/></label></div> : <div className="claim-view"><p>{claim.claim_text}</p>{claim.researcher_notes && <div><span className="section-label">Research notes</span><p>{claim.researcher_notes}</p></div>}</div>}<dl className="detail-facts"><div><dt>Parameter</dt><dd>{claim.parameter_fields?.label || "Unassigned"}</dd></div><div><dt>Review</dt><dd>{human(claim.review_status)}</dd></div><div><dt>Certainty</dt><dd>{human(claim.certainty)}</dd></div><div><dt>Claim kind</dt><dd>{human(claim.claim_kind)}</dd></div><div><dt>Evidence type</dt><dd>{human(claim.evidence_type || "unclassified")}</dd></div><div><dt>Knowledge type</dt><dd>{human(claim.epistemics?.epistemic_type || claim.epistemics?.proposed_type || "Unclassified").toLowerCase()}</dd></div></dl>{claim.epistemics?.contract_basis && <p className="field-help">Evidence assessment: {claim.epistemics.contract_basis}</p>}<h3 className="detail-section-title">Supporting evidence</h3>{claim.claim_sources.map(link => <article className="passage" key={link.id}><strong>{link.sources?.title || "Source"}</strong><small>{[human(link.relationship), link.page_or_section].filter(Boolean).join(" · ")}</small>{link.evidence_excerpt && <p>{link.evidence_excerpt}</p>}{link.sources && sourceById.has(link.sources.id) ? <button className="text-action" type="button" onClick={() => open({ kind: "source", item: sourceById.get(link.sources!.id)! })}>View source record <ArrowUpRight size={14}/></button> : link.sources?.url && <a href={link.sources.url} target="_blank" rel="noreferrer">Open original source ↗</a>}</article>)}{claim.claim_chunks.map((link, index) => <article className="passage" key={link.source_chunks?.id || index}><strong>{link.source_chunks?.sources?.title || "Source passage"}</strong><small>{[human(link.relationship), link.source_chunks?.page_or_section, link.source_chunks?.textual_layer].filter(Boolean).join(" · ")}</small><p>{link.source_chunks?.chunk_text}</p>{link.source_chunks?.sources && sourceById.has(link.source_chunks.sources.id) && <button className="text-action" type="button" onClick={() => open({ kind: "source", item: sourceById.get(link.source_chunks!.sources!.id)! })}>View source record <ArrowUpRight size={14}/></button>}</article>)}{!claim.claim_sources.length && !claim.claim_chunks.length && <p className="empty-note">No evidence links have been added to this claim.</p>}{claim.claim_reviews.length > 0 && <><h3 className="detail-section-title">Review history</h3>{claim.claim_reviews.map((entry, index) => <div className="review-entry" key={index}><strong>{human(entry.decision)}</strong> · {entry.reviewer_name.startsWith("system_") ? "Automated review" : entry.reviewer_name} · {new Date(entry.reviewed_at).toLocaleDateString()}{entry.notes && <p>{entry.notes}</p>}</div>)}</>}</>}
    </div>
      <div className="sheet-actions">
        {error && <p className="form-error" role="alert">{error}</p>}
        {locked && <p className="field-help">Approved records must return to review before editing. Use “Return to review” below.</p>}
        {source && editing && <p className="field-help">Title and source type are required. URLs must start with http:// or https://.</p>}
        {claim && editing && <p className="field-help">Claim text is required.</p>}
        {creating && <>
          <p className="field-help">Title and source type are required. If you add a URL, start it with http:// or https://.</p>
          <Button disabled={busy || draft.title?.trim().length < 2 || !draft.source_type?.trim() || (!!draft.url && !/^https?:\/\//i.test(draft.url))} onClick={() => mutate(() => api("/api/corpus/sources", { method: "POST", headers: json, body: JSON.stringify({ title: draft.title?.trim(), author: draft.author || null, sourceType: draft.source_type?.trim(), url: draft.url || null, citation: draft.citation || null, personalityId: personId }) }), "Source added as a candidate for review.")}>{busy ? "Creating…" : "Create candidate"}</Button>
        </>}
        {source && <>
          {!locked && !editing && <Button variant="outline" disabled={busy} onClick={() => setEditing(true)}>Edit source</Button>}
          {editing && <><Button disabled={busy || draft.title?.trim().length < 2 || !draft.source_type?.trim() || (!!draft.url && !/^https?:\/\//i.test(draft.url))} onClick={saveSource}>{busy ? "Saving…" : "Save source"}</Button><Button variant="outline" disabled={busy} onClick={cancelEdit}>Cancel edit</Button></>}
          {!editing && <>
            {source.source_status !== "approved" && <Button variant="outline" disabled={busy} onClick={() => review("approved")}>Approve</Button>}
            {source.source_status === "approved" && <Button variant="outline" disabled={busy} onClick={() => review("candidate")}>Return to review</Button>}
            {source.source_status !== "rejected" && <Button variant="outline" disabled={busy} onClick={() => review("rejected")}>Reject</Button>}
            {canDelete && !chunksLoading && !error && <Button variant="ghost" disabled={busy} onClick={() => setConfirm({ kind: "delete" })}>Remove candidate</Button>}
            {source.source_status === "candidate" && !canDelete && !chunksLoading && <p className="field-help">This source has linked passages or claims, so it cannot be removed here.</p>}
          </>}
        </>}
        {claim && <>
          {!locked && !editing && <Button variant="outline" disabled={busy} onClick={() => setEditing(true)}>Edit claim</Button>}
          {editing && <><Button disabled={busy || draft.claim_text?.trim().length < 2} onClick={saveClaim}>{busy ? "Saving…" : "Save claim"}</Button><Button variant="outline" disabled={busy} onClick={cancelEdit}>Cancel edit</Button></>}
          {!editing && <>
            {claim.review_status !== "approved" && <Button variant="outline" disabled={busy} onClick={() => review("approved")}>Approve</Button>}
            {claim.review_status === "approved" && <Button variant="outline" disabled={busy} onClick={() => review("needs_review")}>Return to review</Button>}
            {claim.review_status !== "rejected" && <Button variant="outline" disabled={busy} onClick={() => review("rejected")}>Reject</Button>}
            {canDelete && <Button variant="ghost" disabled={busy} onClick={() => setConfirm({ kind: "delete" })}>Remove draft</Button>}
          </>}
        </>}
      </div></SheetContent></Sheet>
    <Dialog open={newClaim} onOpenChange={open => { if (!open && !busy) { setNewClaim(false); setError(""); } }}><DialogContent className="claim-dialog"><DialogHeader><DialogTitle>Add claim for {selectedName}</DialogTitle><DialogDescription>Create a draft linked to a source. Claim text, research field, source, and excerpt are required.</DialogDescription></DialogHeader>{!claimOptions ? <p className="field-help">Loading research fields…</p> : !sources.length ? <div className="resource-empty"><p>Add a source for {selectedName} before creating a claim.</p><Button variant="outline" size="sm" onClick={() => { setNewClaim(false); setTab("sources"); startCreate(); }}>Add source</Button></div> : <div className="sheet-fields"><label>Claim text *<Textarea value={claimDraft.text} onChange={event => setClaimDraft(current => ({ ...current, text: event.target.value }))} maxLength={4000} placeholder="State one claim that the source supports" disabled={busy}/></label><label>Research field *<Select value={claimDraft.fieldId || null} onValueChange={value => setClaimDraft(current => ({ ...current, fieldId: value || "" }))} disabled={busy}><SelectTrigger><SelectValue>{fieldOptions.find(field => field.id === claimDraft.fieldId)?.label || "Choose a research field"}</SelectValue></SelectTrigger><SelectContent>{fieldOptions.map(field => <SelectItem key={field.id} value={field.id}>{field.group} · {field.label}</SelectItem>)}</SelectContent></Select>{!fieldOptions.length && <span className="field-help">No research fields are configured for this person.</span>}</label><label>Supporting source *<Select value={claimDraft.sourceId || null} onValueChange={value => setClaimDraft(current => ({ ...current, sourceId: value || "" }))} disabled={busy}><SelectTrigger><SelectValue>{sources.find(item => item.id === claimDraft.sourceId)?.title || "Choose a source"}</SelectValue></SelectTrigger><SelectContent>{sources.map(item => <SelectItem key={item.id} value={item.id}>{item.title}</SelectItem>)}</SelectContent></Select></label><div className="claim-form-pair"><label>Claim kind<Select value={claimDraft.kind} onValueChange={value => setClaimDraft(current => ({ ...current, kind: value || "traditional_account" }))} disabled={busy}><SelectTrigger><SelectValue>{human(claimDraft.kind)}</SelectValue></SelectTrigger><SelectContent>{["traditional_account", "textual_tradition", "established_fact", "scholarly_interpretation", "contested"].map(value => <SelectItem key={value} value={value}>{human(value)}</SelectItem>)}</SelectContent></Select></label><label>Certainty<Select value={claimDraft.certainty} onValueChange={value => setClaimDraft(current => ({ ...current, certainty: value || "unknown" }))} disabled={busy}><SelectTrigger><SelectValue>{human(claimDraft.certainty)}</SelectValue></SelectTrigger><SelectContent>{["unknown", "high", "medium", "low"].map(value => <SelectItem key={value} value={value}>{human(value)}</SelectItem>)}</SelectContent></Select></label></div><label>Supporting excerpt *<Textarea value={claimDraft.excerpt} onChange={event => setClaimDraft(current => ({ ...current, excerpt: event.target.value }))} placeholder="Paste the relevant words from the source" disabled={busy}/></label><label>Page or section<Input value={claimDraft.locator} onChange={event => setClaimDraft(current => ({ ...current, locator: event.target.value }))} placeholder="For example, Bala Kanda 1.19" disabled={busy}/></label><label>Research notes (optional)<Textarea value={claimDraft.notes} onChange={event => setClaimDraft(current => ({ ...current, notes: event.target.value }))} disabled={busy}/></label></div>}{error && <p className="form-error" role="alert">{error}</p>}<div className="claim-dialog-actions"><Button variant="outline" disabled={busy} onClick={() => setNewClaim(false)}>Cancel</Button><Button disabled={busy || !claimDraft.text.trim() || !claimDraft.fieldId || !claimDraft.sourceId || !claimDraft.excerpt.trim()} onClick={() => { setTab("claims"); setStatus("all"); setQuery(""); setPage(1); void mutate(() => api("/api/research/claim", { method: "POST", headers: json, body: JSON.stringify({ personalityId: personId, parameterFieldId: claimDraft.fieldId, claimText: claimDraft.text.trim(), claimKind: claimDraft.kind, certainty: claimDraft.certainty, researcherNotes: claimDraft.notes || null, existingSourceId: claimDraft.sourceId, evidenceExcerpt: claimDraft.excerpt.trim(), pageOrSection: claimDraft.locator || null, evidenceRelationship: "supports" }) }), "Draft claim added. It now appears in Claims."); }}>{busy ? "Creating…" : "Create draft"}</Button></div></DialogContent></Dialog>
    <AlertDialog open={!!confirm} onOpenChange={open => { if (!open && !busy) setConfirm(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{confirm?.kind === "delete" ? "Remove this record?" : `${confirm?.status === "approved" ? "Approve" : confirm?.status === "rejected" ? "Reject" : "Return to review"} this ${detail?.kind || "record"}?`}</AlertDialogTitle><AlertDialogDescription>{confirm?.kind === "delete" ? "This permanently removes an unlinked candidate source or draft claim." : "This updates the review state and records the reviewer. Claim decisions also appear in review history."}</AlertDialogDescription></AlertDialogHeader>{confirm?.kind === "review" && <div className="sheet-fields"><label>Reviewer name<Input value={reviewer} onChange={event => setReviewer(event.target.value)} maxLength={200} autoFocus/></label><label>Review note (optional)<Textarea value={reviewNote} onChange={event => setReviewNote(event.target.value)} maxLength={4000}/></label></div>}{error && <p className="form-error" role="alert">{error}</p>}<AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>{confirm?.kind === "delete" ? <AlertDialogAction disabled={busy} onClick={event => { event.preventDefault(); if (detail) void mutate(() => api("/api/resources", { method: "DELETE", headers: json, body: JSON.stringify({ kind: detail.kind, id: detail.item.id }) }), "Record removed."); }}>{busy ? "Removing…" : "Remove"}</AlertDialogAction> : <Button disabled={busy || !reviewer.trim()} onClick={() => void submitReview()}>{busy ? "Saving…" : "Confirm decision"}</Button>}</AlertDialogFooter></AlertDialogContent></AlertDialog>
  </main>;
}

function EmptyList({ filtered, kind, person, clear, add }: { filtered: boolean; kind: "sources" | "claims"; person: string; clear: () => void; add?: () => void }) {
  return <div className="resource-empty"><p>{filtered ? `No ${kind} match these filters.` : `No ${kind} have been added for ${person} yet.`}</p>{filtered ? <Button variant="outline" size="sm" onClick={clear}>Clear filters</Button> : add ? <Button variant="outline" size="sm" onClick={add}><Plus size={14}/> Add {kind === "sources" ? "source" : "claim"}</Button> : null}</div>;
}

function LoadingRows({ kind }: { kind: "sources" | "claims" }) {
  return <div className="resource-loading" role="status"><p>Loading {kind}…</p>{[0, 1, 2].map(index => <div className="resource-loading-row" key={index}><Skeleton className="h-4 w-2/3"/><Skeleton className="h-4 w-1/5"/></div>)}</div>;
}
