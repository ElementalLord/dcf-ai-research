"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Check, ChevronRight, FileText, Globe2, LibraryBig, LoaderCircle, LogOut, Plus, Search, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { groupByCategory } from "@/lib/personality-groups";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import SearchSources from "./search-sources";
import WebsiteAccess from "./website-access";
import ResourceHelp from "./resource-help";
import ConfirmResourceChange, { type PendingResourceChange } from "./confirm-resource-change";
import { AUTHORITY_CAVEAT, AUTHORITY_LABELS, classifySourceAuthority } from "@/lib/sources/authority";

type Person = { id: string; canonical_name: string; category?: string | null };
type Evidence = { id: string; relationship: string; evidence_excerpt: string | null; page_or_section: string | null; sources: { id: string; title: string; author: string | null; url: string | null } | null };
type ChunkLink = { relationship: string; confidence: number | null; link_method: string | null; metadata: Record<string, unknown> | null; source_chunks: { id: string; chunk_text: string; page_or_section: string | null; textual_layer: string | null; sources: { id: string; title: string; url: string | null } | null } | null };
type EvidenceAssessment = { status: string; label: string; confidence: number; reasons: string[]; independentCorroborationNeeded: boolean; humanReviewRequired: true };
type Claim = { id: string; claim_text: string; claim_kind: string; certainty: string; review_status: string; approval_origin: string | null; approval_metadata: { testing_only?: boolean } | null; approved_by_label: string | null; approved_at?: string | null; created_at?: string | null; updated_at?: string | null; evidence_type: string | null; researcher_notes: string | null; parameter_fields: { label: string } | null; claim_sources: Evidence[]; claim_chunks: ChunkLink[]; epistemics: { epistemic_type: string | null; proposed_type: string; contract_status: string; contract_basis: string | null } | null; evidenceAssessment: EvidenceAssessment; claim_reviews: Array<{ reviewer_name: string; decision: string; notes: string | null; reviewed_at: string }> };
type Source = { id: string; title: string; author: string | null; publisher_or_institution: string | null; source_type: string; url: string | null; citation: string | null; textual_layer: string | null; source_status: string; approval_origin: string | null; approval_note: string | null; approved_by_label: string | null; approved_at?: string | null; created_at?: string | null; ingestion_status: string; rights_or_access_note: string | null; publication_year: number | null; updated_at: string | null; metadata: { testing_only?: boolean; resourceAudit?: { access?: string; parallelUrl?: string; parallelLabel?: string; parallelLinkLabel?: string; evidenceNote?: string; checkedAt?: string; checkedExcerpts?: number; matchedExcerpts?: number } } | null };
type Detail = { kind: "source"; item: Source } | { kind: "claim"; item: Claim };
type ReviewAction = "approved" | "candidate" | "needs_review" | "rejected";
type Confirm = { kind: "delete" } | { kind: "review"; status: ReviewAction };
type ResearchOptions = { personalities: Array<Person & { category_id: string | null }>; categories: Array<{ id: string; parameters: Array<{ id: string; name: string; parameter_fields: Array<{ id: string; label: string }> }> }> };
const json = { "Content-Type": "application/json" };
const human = (value: string) => ({ primary_text: "Original text", institutional: "Institutional record", scholarly_article: "Scholarly article", scholarly_book: "Scholarly book", secondary_source: "Scholarly source", traditional_narrative: "Traditional account" }[value] || value.replaceAll("_", " "));
const matchesSearch = (query: string, fields: Array<string | null | undefined>) => {
  const searchable = fields.join(" ").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return query.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().split(/\s+/).every(term => searchable.includes(term));
};
const sourceChoice = (source: Source) => source.url ? `${source.title} · ${source.url}` : source.title;
const claimSourceCount = (claim: Claim) => new Set([...claim.claim_sources.map(link => link.sources?.id), ...claim.claim_chunks.map(link => link.source_chunks?.sources?.id)].filter(Boolean)).size;
const sourceReviewLabel = (source: Source) => source.source_status === "approved" ? "Admitted" : "Not admitted";
const claimReviewLabel = (claim: Claim) => claim.review_status === "approved" ? "Approved" : claim.review_status === "draft" ? "Draft" : claim.review_status === "rejected" ? "Rejected" : "Needs review";
const filterStatusLabel = (value: string, area: string) => value === "all" ? "All statuses" : area === "sources" ? value === "approved" ? "Admitted" : value === "not_admitted" ? "Not admitted" : "Rejected archive" : value === "approved" ? "Approved" : value === "draft" ? "Draft" : value === "needs_review" ? "Needs review" : "Rejected archive";
const sourceAuthority = (source: Pick<Source, "url" | "source_type" | "publisher_or_institution">) => classifySourceAuthority({ url: source.url, sourceType: source.source_type, institution: source.publisher_or_institution });
const day = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "Not recorded";
// Who or what stands behind an approval, in words a reviewer can act on.
const approvalBasis = (origin: string | null, label: string | null) => (origin === "human_manual" || origin === "mentor_review") && label && !label.startsWith("system_") ? `Reviewed by ${label}`
  : ({ human_manual: "Reviewed by a person", mentor_review: "Mentor review", system_test_bulk: "Bulk approval for testing; not individually reviewed", imported_existing: "Imported with the original corpus", ai_candidate: "AI checked; not yet reviewed by a person" }[origin || ""] || "Not recorded");
function normalizedSourceUrl(value: string): string | null {
  if (!value.trim()) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`);
    return /^https?:$/.test(url.protocol) && url.hostname && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
}
const fieldNames: Record<string, string> = { title: "Title *", author: "Author", publisher_or_institution: "Publisher or institution", source_type: "Source type (optional)", url: "Original URL", citation: "Citation", textual_layer: "Textual layer", rights_or_access_note: "Rights or access note" };
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
  const [websiteCounts, setWebsiteCounts] = useState<{ found: number; admitted: number } | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [reviewTarget, setReviewTarget] = useState<Detail | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [chunks, setChunks] = useState<Array<{ id: string; chunk_text: string; page_or_section: string | null; textual_layer: string | null }>>([]);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [loading, setLoading] = useState(authorized && personalities.length > 0);
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState("");
  const [stale, setStale] = useState(false);
  const [error, setError] = useState(loadError ? "People could not be loaded. Refresh Resources to try again." : "");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [sourceType, setSourceType] = useState("all");
  const [sourceSort, setSourceSort] = useState("title");
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [pending, setPending] = useState<PendingResourceChange | null>(null);
  const [reviewer, setReviewer] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [passage, setPassage] = useState("");
  const [passageLocator, setPassageLocator] = useState("");
  const [showPassage, setShowPassage] = useState(false);
  const [newClaim, setNewClaim] = useState(false);
  const [claimOptions, setClaimOptions] = useState<ResearchOptions | null>(null);
  const [claimOptionsLoading, setClaimOptionsLoading] = useState(false);
  const [claimDraft, setClaimDraft] = useState({ fieldId: "", sourceId: "", sourceQuery: "", newSourceTitle: "", newSourceUrl: "", newSourceType: "other", text: "", kind: "traditional_account", certainty: "unknown", excerpt: "", locator: "", notes: "" });
  const [claimSourceMode, setClaimSourceMode] = useState<"existing" | "new">("existing");
  const sheetScroll = useRef<HTMLDivElement>(null);
  const selectedName = personalities.find(p => p.id === personId)?.canonical_name || "this person";
  useEffect(() => { if (!authorized) return; let active = true; void api<{ discovered: Array<{ admission_status: string }> }>("/api/resources/search-sources").then(result => { if (active) setWebsiteCounts({ found: result.discovered.length, admitted: result.discovered.filter(item => item.admission_status === "admitted").length }); }).catch(() => { if (active) setWebsiteCounts(null); }); return () => { active = false; }; }, [authorized]);
  const selectedClaim = claims.find(item => item.id === selectedClaimId) || null;
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
    return matchesSearch(query, [source.title, source.author, source.publisher_or_institution, source.source_type, source.citation, source.url, source.textual_layer]) && (status === "rejected" ? source.source_status === "rejected" : status === "not_admitted" ? source.source_status !== "approved" && source.source_status !== "rejected" : source.source_status !== "rejected" && (status === "all" || source.source_status === status)) && (sourceType === "all" || source.source_type === sourceType);
  }).sort((a, b) => sourceSort === "claims" ? (linkedClaims.get(b.id)?.length || 0) - (linkedClaims.get(a.id)?.length || 0) || a.title.localeCompare(b.title) : sourceSort === "updated" ? (b.updated_at || "").localeCompare(a.updated_at || "") || a.title.localeCompare(b.title) : a.title.localeCompare(b.title));
  const sourceTypes = [...new Set(sources.map(source => source.source_type))].sort();
  const filteredClaims = claims.filter(claim => {
    return matchesSearch(query, [claim.claim_text, claim.parameter_fields?.label, claim.claim_kind, ...claim.claim_sources.map(link => link.sources?.title)]) && (status === "rejected" ? claim.review_status === "rejected" : claim.review_status !== "rejected" && (status === "all" || claim.review_status === status));
  });
  const availableStatuses = tab === "sources" ? ["all", "approved", "not_admitted", "rejected"] : ["all", "draft", "needs_review", "approved", "rejected"];
  const activeList = tab === "sources" ? filteredSources : filteredClaims;
  const resultLabel = tab === "sources" ? (activeList.length === 1 ? "source" : "sources") : (activeList.length === 1 ? "claim" : "claims");
  const pageCount = Math.max(1, Math.ceil(activeList.length / 24));
  const currentPage = Math.min(page, pageCount);
  const visibleSources = filteredSources.slice((currentPage - 1) * 24, currentPage * 24);
  const visibleClaims = filteredClaims.slice((currentPage - 1) * 24, currentPage * 24);
  const claimGroups = Object.entries(visibleClaims.reduce<Record<string, Claim[]>>((groups, item) => {
    const name = item.parameter_fields?.label || "Unassigned";
    (groups[name] ||= []).push(item);
    return groups;
  }, {}));
  const approvedClaims = claims.filter(item => item.review_status === "approved").length;
  const awaitingClaims = claims.filter(item => item.review_status === "needs_review" || item.review_status === "candidate").length;
  const draftClaims = claims.filter(item => item.review_status === "draft").length;
  const activeClaims = claims.filter(item => item.review_status !== "rejected").length;
  const categoryId = claimOptions?.personalities.find(person => person.id === personId)?.category_id;
  const fieldOptions = claimOptions?.categories.find(category => category.id === categoryId)?.parameters.flatMap(parameter => parameter.parameter_fields.map(field => ({ ...field, group: parameter.name }))) || [];
  const load = useCallback(async (id: string) => {
    const result = await api<{ sources: Source[]; claims: Claim[] }>(`/api/resources?personalityId=${encodeURIComponent(id)}`);
    setSources(result.sources); setClaims(result.claims); setStale(false);
  }, []);
  useEffect(() => {
    if (!authorized || !personId) return;
    let active = true;
    void api<{ sources: Source[]; claims: Claim[] }>(`/api/resources?personalityId=${encodeURIComponent(personId)}`)
      .then(result => { if (active) { setSources(result.sources); setClaims(result.claims); setStale(false); setError(""); setLoading(false); } })
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
  function choosePerson(id: string) { setPersonId(id); setDetail(null); setSelectedClaimId(null); setCreating(false); setQuery(""); setStatus("all"); setSourceType("all"); setPage(1); setLoading(true); setStale(false); setError(""); }
  function open(item: Detail) { sheetScroll.current?.scrollTo({ top: 0 }); setError(""); setNotice(""); setCreating(false); setEditing(false); setShowPassage(false); setPassage(""); setPassageLocator(""); setChunks([]); setChunksLoading(item.kind === "source"); setDetail(item); setDraft(Object.fromEntries(Object.entries(item.item).map(([key, value]) => [key, typeof value === "string" ? value : ""]))); }
  function startCreate() { setStatus("all"); setSourceType("all"); setQuery(""); setPage(1); setDetail(null); setCreating(true); setEditing(true); setError(""); setDraft({ title: "", author: "", source_type: "other", url: "", citation: "" }); }
  async function startClaim() {
    setStatus("all"); setQuery(""); setPage(1); setError(""); setNewClaim(true); setClaimOptions(null); setClaimOptionsLoading(true);
    setClaimSourceMode(sources.some(source => source.source_status !== "rejected") ? "existing" : "new");
    setClaimDraft({ fieldId: "", sourceId: "", sourceQuery: "", newSourceTitle: "", newSourceUrl: "", newSourceType: "other", text: "", kind: "traditional_account", certainty: "unknown", excerpt: "", locator: "", notes: "" });
    try { setClaimOptions(await api<ResearchOptions>("/api/research/options")); }
    catch { setError("Research fields could not be loaded. Try again."); }
    finally { setClaimOptionsLoading(false); }
  }
  function closeSheet() { if (busy) return; setDetail(null); setCreating(false); setEditing(false); setError(""); setShowPassage(false); }
  function cancelEdit() {
    if (!detail) return;
    setDraft(Object.fromEntries(Object.entries(detail.item).map(([key, value]) => [key, typeof value === "string" ? value : ""])));
    setEditing(false);
    setError("");
  }
  async function mutate(action: () => Promise<unknown>, success: string | ((result: unknown) => string), progress = "Saving changes…") {
    if (busy) return false;
    setBusy(true); setActivity(progress); setError("");
    try {
      const result = await action();
      setDetail(null); setSelectedClaimId(null); setReviewTarget(null); setCreating(false); setNewClaim(false); setConfirm(null); setNotice(typeof success === "string" ? success : success(result)); setShowPassage(false);
      setActivity("Refreshing resource list…");
      try { await load(personId); }
      catch { setStale(true); setError("The change was saved, but the list could not refresh. Retry to load current records."); }
      return true;
    } catch (cause) { setError(friendlyError(cause)); return false; }
    finally { setBusy(false); setActivity(""); }
  }
  function queueChange(title: string, description: string, confirmLabel: string, action: () => Promise<unknown>, success: string | ((result: unknown) => string), progress?: string) {
    setError("");
    setPending({ title, description, confirmLabel, run: () => mutate(action, success, progress) });
  }
  async function confirmChange() {
    if (!pending || busy) return;
    if (await pending.run()) setPending(null);
  }
  async function signIn(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try { await api("/api/admin/session", { method: "POST", headers: json, body: JSON.stringify({ token }) }); window.location.reload(); }
    catch (cause) {
      const denied = cause instanceof Error && /invalid administrator access key/i.test(cause.message);
      setError(denied ? "That code didn’t work. Check it and try again." : "The code could not be checked. Try again.");
      setBusy(false);
    }
  }
  async function signOut() {
    if (busy) return;
    setBusy(true);
    try { await api("/api/admin/session", { method: "DELETE" }); window.location.reload(); }
    catch { setError("Could not sign out. Try again."); setBusy(false); }
  }
  if (!authorized) return <main className="resources-page page-shell"><div className="resources-intro"><h1>Resources</h1><p>Review sources and claims, and manage which websites research may search. Sign in to see current counts and controls.</p><form className="login-form" onSubmit={signIn}><label htmlFor="admin-token">Admin code</label><Input id="admin-token" type="password" autoComplete="off" spellCheck={false} value={token} onChange={event => { setToken(event.target.value); if (error) setError(""); }} aria-invalid={!!error} aria-describedby={error ? "admin-access-result" : undefined} required/><Button type="submit" disabled={busy || !token.trim()}>{busy ? "Checking code…" : "Open Resources"}</Button>{error && <p id="admin-access-result" className="admin-access-denied" role="alert">{error}</p>}</form></div></main>;
  const source = detail?.kind === "source" ? detail.item : null;
  const claim = detail?.kind === "claim" ? detail.item : null;
  const locked = source?.source_status === "approved" || claim?.review_status === "approved";
  const canDelete = source?.source_status === "candidate" && !chunks.length && !(linkedClaims.get(source.id)?.length) || claim?.review_status === "draft";
  const saveSource = () => queueChange("Save source changes?", `${source?.title || "This source"} will be updated.`, "Save source", () => api("/api/resources", { method: "PATCH", headers: json, body: JSON.stringify({ kind: "source", id: source?.id, fields: { title: draft.title?.trim(), author: draft.author || null, publisher_or_institution: draft.publisher_or_institution || null, source_type: draft.source_type?.trim() || "other", url: normalizedSourceUrl(draft.url || ""), citation: draft.citation || null, textual_layer: draft.textual_layer || null, rights_or_access_note: draft.rights_or_access_note || null } }) }), "Source saved. Its details have been refreshed.", "Saving source and refreshing list…");
  const saveClaim = () => queueChange("Save claim changes?", "The claim text, certainty, or notes will be updated.", "Save claim", () => api("/api/resources", { method: "PATCH", headers: json, body: JSON.stringify({ kind: "claim", id: claim?.id, fields: { claim_text: draft.claim_text?.trim(), certainty: draft.certainty || "unknown", researcher_notes: draft.researcher_notes || null } }) }), "Claim updated. Its details have been refreshed.");
  const review = (next: ReviewAction) => { setReviewTarget(null); setReviewer(""); setReviewNote(""); setConfirm({ kind: "review", status: next }); };
  const reviewSelectedClaim = (item: Claim, next: ReviewAction) => { setReviewTarget({ kind: "claim", item }); setReviewer(""); setReviewNote(""); setConfirm({ kind: "review", status: next }); };
  async function submitReview() {
    const target = reviewTarget || detail;
    if (!target || !confirm || confirm.kind !== "review") return;
    const status = confirm.status;
    await mutate(() => api(target.kind === "source" ? "/api/corpus/sources" : "/api/review/update", { method: target.kind === "source" ? "PATCH" : "POST", headers: json, body: JSON.stringify(target.kind === "source" ? { sourceId: target.item.id, status, approvedByLabel: reviewer.trim(), approvalOrigin: "human_manual", approvalNote: reviewNote.trim() || undefined } : { claimId: target.item.id, status, reviewerName: reviewer.trim(), approvalOrigin: "human_manual", notes: reviewNote.trim() || undefined }) }), status === "approved" ? "Review approved." : status === "rejected" ? "Record rejected." : "Record returned to review. You can now edit it.");
  }
  return <main className="resources-page page-shell">
    <div className="resource-heading">
      <h1>Resources</h1>
      <div className="resource-heading-actions"><Link className="readiness-back" href="/resources/readiness">Readiness</Link><ResourceHelp area={tab as "sources" | "claims" | "websites"}/><details className="resource-account"><summary aria-label="Account menu"><UserRound size={18} aria-hidden="true"/></summary><div><Button type="button" variant="ghost" className="resource-signout" disabled={busy} onClick={signOut}><LogOut size={16} aria-hidden="true"/> Sign out</Button></div></details></div>
    </div>
    {(activity || loading) && <div className="resource-activity" role="status" aria-live="polite"><LoaderCircle size={16} className="animate-spin"/>{activity || `Loading resources for ${selectedName}…`}</div>}
    {notice && <div className="resource-notice" role="status"><Check size={16}/>{notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss message"><X size={15}/></button></div>}
    {stale && <p className="resource-stale" role="status">Showing the last loaded records. A recent change may not appear yet.</p>}
    {error && !detail && !creating && <div className="resource-error" role="alert">{error}<Button variant="outline" size="sm" onClick={() => { setLoading(true); void load(personId).then(() => { setError(""); setLoading(false); }).catch(() => { setError("Resources could not be loaded. Try again."); setLoading(false); }); }}>Retry</Button></div>}
    <div className="resource-person-bar"><label htmlFor="resource-person-select">Person</label><Select value={personId} onValueChange={value => choosePerson(value || "")} disabled={busy || loading}><SelectTrigger id="resource-person-select" aria-label="Choose person"><SelectValue>{selectedName}</SelectValue></SelectTrigger><SelectContent>{groupByCategory(personalities).map(group => <SelectGroup key={group.label}><SelectLabel>{group.label}</SelectLabel>{group.people.map(person => <SelectItem key={person.id} value={person.id}>{person.canonical_name}</SelectItem>)}</SelectGroup>)}</SelectContent></Select></div>
    <section className="resource-overview" aria-label={`Resource summary for ${selectedName}`} aria-live="polite"><div><strong>{loading ? "…" : sources.filter(item => item.source_status === "approved").length}</strong><span>sources admitted</span></div><div><strong>{loading ? "…" : `${approvedClaims} of ${claims.filter(item => item.review_status !== "rejected").length}`}</strong><span>claims approved</span></div><div><strong>{websiteCounts ? websiteCounts.found : "…"}</strong><span>websites found{websiteCounts ? ` · ${websiteCounts.admitted} admitted` : ""}</span></div></section>
    <Tabs value={tab} onValueChange={value => { setTab(value); setSelectedClaimId(null); setStatus("all"); setPage(1); }} className="resource-tabs">
      <TabsList variant="line" aria-label="Resource areas" className="resource-area-tabs">
        <TabsTrigger value="sources" className="resource-area-tab resource-area-tab-sources"><LibraryBig size={18} aria-hidden="true"/><span className="resource-tab-label"><strong>Sources</strong></span><span className="resource-tab-count">{loading ? "…" : sources.filter(item => item.source_status !== "rejected").length}</span></TabsTrigger>
        <TabsTrigger value="claims" className="resource-area-tab resource-area-tab-claims"><FileText size={18} aria-hidden="true"/><span className="resource-tab-label"><strong>Claims</strong></span><span className="resource-tab-count">{loading ? "…" : claims.filter(item => item.review_status !== "rejected").length}</span></TabsTrigger>
        <TabsTrigger value="websites" className="resource-area-tab resource-area-tab-websites"><Globe2 size={18} aria-hidden="true"/><span className="resource-tab-label"><strong>Web search</strong></span><span className="resource-tab-count">{websiteCounts ? websiteCounts.found : "…"}</span></TabsTrigger>
      </TabsList>

      <div className="resource-workspace"><section className="resource-main" aria-label="Resource workspace">
        {(tab === "sources" || tab === "claims") && <>
          {tab === "claims" && <div className="claim-review-summary"><div className="claim-review-summary-top"><div><h2>{approvedClaims} of {activeClaims} claims approved</h2><p>Only approved claims are used in AI answers.</p></div><Button onClick={() => { const next = claims.find(item => item.review_status === "needs_review") || claims.find(item => item.review_status === "draft"); if (next) { setQuery(""); setStatus("all"); const visible = claims.filter(item => item.review_status !== "rejected"); setPage(Math.floor(visible.findIndex(item => item.id === next.id) / 24) + 1); setSelectedClaimId(next.id); } }} disabled={!awaitingClaims && !draftClaims}>Review next claim</Button></div><div className="claim-progress" role="img" aria-label={`${approvedClaims} approved, ${awaitingClaims} need review, ${draftClaims} drafts`}>{activeClaims > 0 && <><span className="claim-progress-reviewed" style={{ width: `${approvedClaims / activeClaims * 100}%` }}/><span className="claim-progress-awaiting" style={{ width: `${awaitingClaims / activeClaims * 100}%` }}/><span className="claim-progress-draft" style={{ width: `${draftClaims / activeClaims * 100}%` }}/></>}</div><div className="claim-progress-legend"><span className="legend-reviewed">{approvedClaims} approved</span><span className="legend-awaiting">{awaitingClaims} needs review</span><span className="legend-draft">{draftClaims} draft</span></div></div>}
          <div className={`resource-list-toolbar ${tab === "sources" ? "resource-list-toolbar-sources" : ""}`}>
            <label className="search-field"><Search size={18} aria-hidden="true"/><Input value={query} onChange={event => { setQuery(event.target.value); setPage(1); setSelectedClaimId(null); }} placeholder={tab === "sources" ? "Find a source…" : "Find a claim…"} aria-label={`Search ${tab}`}/></label>
            <label className="status-field">Status<Select value={status} onValueChange={value => { setStatus(value || "all"); setPage(1); setSelectedClaimId(null); }}><SelectTrigger><SelectValue>{filterStatusLabel(status, tab)}</SelectValue></SelectTrigger><SelectContent>{availableStatuses.map(value => <SelectItem key={value} value={value}>{filterStatusLabel(value, tab)}</SelectItem>)}</SelectContent></Select></label>
            {tab === "sources" && <label className="status-field">Source type<Select value={sourceType} onValueChange={value => { setSourceType(value || "all"); setPage(1); }}><SelectTrigger><SelectValue>{sourceType === "all" ? "All types" : human(sourceType)}</SelectValue></SelectTrigger><SelectContent><SelectItem value="all">All types</SelectItem>{sourceTypes.map(value => <SelectItem key={value} value={value}>{human(value)}</SelectItem>)}</SelectContent></Select></label>}
            {tab === "sources" && <label className="status-field">Sort by<Select value={sourceSort} onValueChange={value => setSourceSort(value || "title")}><SelectTrigger><SelectValue>{{title: "Title", claims: "Most claims", updated: "Recently updated"}[sourceSort] || "Title"}</SelectValue></SelectTrigger><SelectContent><SelectItem value="title">Title</SelectItem><SelectItem value="claims">Most claims</SelectItem><SelectItem value="updated">Recently updated</SelectItem></SelectContent></Select></label>}
            <Button className={`resource-add-button ${tab === "claims" ? "resource-add-button-claim" : ""}`} onClick={tab === "sources" ? startCreate : () => void startClaim()} disabled={!personId || loading}><Plus size={16}/> Add {tab === "sources" ? "source" : "claim"}</Button>
            {(query || status !== "all" || sourceType !== "all" || sourceSort !== "title") && <Button type="button" variant="ghost" size="sm" onClick={() => { setStatus("all"); setSourceType("all"); setSourceSort("title"); setQuery(""); setPage(1); }}>Clear</Button>}
          </div>
          <div className="resource-list-summary" aria-live="polite"><strong>{activeList.length}</strong> {resultLabel} shown</div>
        </>}
        <TabsContent value="sources">
          {loading ? <LoadingRows kind="sources"/> : filteredSources.length ? <div className="resource-source-table-wrap"><table className="resource-source-table"><thead><tr><th>Title</th><th className="resource-source-type">Type</th><th className="resource-source-count">Linked claims</th><th>Status</th></tr></thead><tbody>{visibleSources.map(item => <tr key={item.id} onClick={() => open({ kind: "source", item })}><td><button type="button" className="resource-source-open" onClick={event => { event.stopPropagation(); open({ kind: "source", item }); }} aria-label={`Open ${item.title}`}><strong>{item.title}</strong><small>{item.publisher_or_institution || item.author || "Publisher not recorded"}</small><small className="resource-source-mobile-count">{linkedClaims.get(item.id)?.length || 0} linked claims</small></button></td><td className="resource-source-type">{human(item.source_type)}</td><td className="resource-source-count">{linkedClaims.get(item.id)?.length || 0}</td><td><span className={`resource-record-status source-status-${item.source_status}`}>{sourceReviewLabel(item)}</span>{item.metadata?.resourceAudit && (item.metadata.resourceAudit.access !== "readable" || item.metadata.resourceAudit.evidenceNote) && <small className="resource-source-attention">Check source</small>}</td></tr>)}</tbody></table></div> : <EmptyList filtered={!!query || status !== "all" || sourceType !== "all"} rejected={status === "rejected"} kind="sources" person={selectedName} clear={() => { setQuery(""); setStatus("all"); setSourceType("all"); setPage(1); }} add={startCreate}/>}
        </TabsContent>
        <TabsContent value="claims">
          {loading ? <LoadingRows kind="claims"/> : filteredClaims.length ? <div className={`resource-claims-layout ${selectedClaim ? "is-open" : ""}`}><div className="resource-record-list resource-claim-groups" aria-label="Claims">
            {claimGroups.map(([category, items]) => <details className="resource-claim-group" key={category} open><summary>{category}<span>{items.length} shown</span></summary><div>{items.map(item => <button type="button" className="resource-record resource-claim-record" key={item.id} aria-pressed={selectedClaimId === item.id} onClick={() => setSelectedClaimId(item.id)}>
              <span className="resource-record-content"><strong>{item.claim_text}</strong><span className="resource-record-meta">{claimSourceCount(item)} {claimSourceCount(item) === 1 ? "source" : "sources"}</span></span>
              <span className={`resource-record-status source-status-${item.review_status}`}>{claimReviewLabel(item)}</span><ChevronRight className="resource-record-arrow" size={18} aria-hidden="true"/>
            </button>)}</div></details>)}
          </div>{selectedClaim && <aside className="resource-claim-panel" aria-label="Selected claim" aria-live="polite"><button type="button" className="resource-panel-close" onClick={() => setSelectedClaimId(null)} aria-label="Close claim panel"><X size={16}/> Close</button><h3>{selectedClaim.claim_text}</h3><p className="resource-panel-category">{selectedClaim.parameter_fields?.label || "Unassigned"} · {claimReviewLabel(selectedClaim)}</p><h4>Evidence</h4>{[...new Map([...selectedClaim.claim_sources.map(link => link.sources).filter((item): item is NonNullable<typeof item> => Boolean(item)), ...selectedClaim.claim_chunks.map(link => link.source_chunks?.sources).filter((item): item is NonNullable<typeof item> => Boolean(item))].map(item => [item.id, { title: item.title, url: item.url }] as const)).entries()].map(([id, evidence]) => <div className="resource-panel-evidence" key={id}>{sourceById.has(id) ? <button type="button" onClick={() => open({ kind: "source", item: sourceById.get(id)! })}>{evidence.title}</button> : evidence.url ? <a href={evidence.url} target="_blank" rel="noreferrer">{evidence.title}</a> : <span>{evidence.title}</span>}<span>Linked source</span></div>)}{!claimSourceCount(selectedClaim) && <p className="resource-panel-note">No linked sources are recorded.</p>}<div className="resource-panel-actions">{selectedClaim.review_status === "approved" ? <Button variant="outline" disabled={busy} onClick={() => reviewSelectedClaim(selectedClaim, "needs_review")}>Move back to review</Button> : <Button className="resource-panel-primary" disabled={busy} onClick={() => reviewSelectedClaim(selectedClaim, "approved")}>Approve claim</Button>}{selectedClaim.review_status === "rejected" ? <Button variant="outline" disabled={busy} onClick={() => reviewSelectedClaim(selectedClaim, "needs_review")}>Return to review</Button> : <Button variant="outline" disabled={busy} onClick={() => reviewSelectedClaim(selectedClaim, "rejected")}>Reject claim</Button>}<Button variant="ghost" onClick={() => open({ kind: "claim", item: selectedClaim })}>Full details</Button></div><p className="resource-panel-note">Approved claims can be used in AI answers.</p></aside>}</div> : <EmptyList filtered={!!query || status !== "all"} rejected={status === "rejected"} kind="claims" person={selectedName} clear={() => { setQuery(""); setStatus("all"); setPage(1); }} add={() => void startClaim()}/>}
        </TabsContent>
        <TabsContent value="websites">{tab === "websites" && <><SearchSources onCountsChange={setWebsiteCounts}/><details className="resource-detail-disclosure"><summary>Page access permissions</summary><WebsiteAccess/></details></>}</TabsContent>
        {(tab === "sources" || tab === "claims") && !loading && activeList.length > 24 && <div className="resource-pagination"><span>Showing {(currentPage - 1) * 24 + 1}–{Math.min(currentPage * 24, activeList.length)} of {activeList.length}</span><div><Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => { setPage(currentPage - 1); setSelectedClaimId(null); }}>Previous</Button><span>Page {currentPage} of {pageCount}</span><Button variant="outline" size="sm" disabled={currentPage === pageCount} onClick={() => { setPage(currentPage + 1); setSelectedClaimId(null); }}>Next</Button></div></div>}
      </section></div>
    </Tabs>
    <Sheet open={!!detail || creating} onOpenChange={open => { if (!open && !pending) closeSheet(); }}><SheetContent className="resource-sheet"><SheetHeader><SheetTitle>{creating ? "Add source" : source ? source.title : claim ? "Claim detail" : "Resource detail"}</SheetTitle><SheetDescription>{creating ? `Add a source for ${selectedName}. It will wait for review.` : source ? `${selectedName} · ${sourceReviewLabel(source)} source` : `${selectedName} · ${claim ? claimReviewLabel(claim) : "draft"} claim`}</SheetDescription></SheetHeader><div className="resource-sheet-scroll" ref={sheetScroll}>
      {detail && <Button variant="ghost" size="sm" className="sheet-back" onClick={closeSheet}><ArrowLeft size={15}/> Back to {tab}</Button>}
      {(creating || source) && <>{creating || editing ? <div className="sheet-fields"><label>Title *<Input value={draft.title || ""} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} disabled={busy} required aria-invalid={!!draft.title && draft.title.trim().length < 2}/></label><label>Website or page URL (optional)<Input value={draft.url || ""} onChange={event => setDraft(current => ({ ...current, url: event.target.value }))} placeholder="Paste a URL or type example.org/page" disabled={busy} aria-invalid={!!draft.url?.trim() && !normalizedSourceUrl(draft.url)}/></label><label>{fieldNames.source_type}<Input list="source-type-suggestions" value={draft.source_type || ""} onChange={event => setDraft(current => ({ ...current, source_type: event.target.value }))} placeholder="For example, primary text or scholarly article" disabled={busy}/></label><datalist id="source-type-suggestions"><option value="primary_text"/><option value="scholarly_article"/><option value="scholarly_book"/><option value="institutional"/><option value="other"/></datalist><details className="source-extra-fields"><summary>More details{[draft.author, draft.publisher_or_institution, draft.citation, draft.textual_layer, draft.rights_or_access_note].some(Boolean) ? " (filled)" : ""}</summary><div className="sheet-fields">{(["author", "publisher_or_institution", "citation", "textual_layer", "rights_or_access_note"] as const).map(key => <label key={key}>{fieldNames[key]}{key === "rights_or_access_note" ? <Textarea value={draft[key] || ""} onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))} disabled={busy} maxLength={2000} className="min-h-20"/> : <Input value={draft[key] || ""} onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))} disabled={busy}/>}</label>)}</div></details></div> : source && <details className="resource-detail-disclosure"><summary>Publication details</summary><dl className="detail-facts detail-primary"><div><dt>Author</dt><dd>{source.author || "Not recorded"}</dd></div><div><dt>Publisher</dt><dd>{source.publisher_or_institution || "Not recorded"}</dd></div><div><dt>Source type</dt><dd>{human(source.source_type)}{sourceAuthority(source).primary ? " · primary source" : ""}</dd></div><div><dt>Authority</dt><dd>{AUTHORITY_LABELS[sourceAuthority(source).level]}. {sourceAuthority(source).basis}.</dd></div><div><dt>Citation</dt><dd>{source.citation || "Not recorded"}</dd></div><div><dt>Textual layer</dt><dd>{source.textual_layer || "Not recorded"}</dd></div></dl></details>}{source && <><details className="resource-detail-disclosure"><summary>Review and access notes</summary><dl className="detail-facts"><div><dt>Review</dt><dd>{sourceReviewLabel(source)}</dd></div>{source.source_status === "approved" && <div><dt>Approved by</dt><dd>{approvalBasis(source.approval_origin, source.approved_by_label)}{source.approved_at ? ` · ${day(source.approved_at)}` : ""}</dd></div>}<div><dt>Added</dt><dd>{day(source.created_at)}{source.updated_at ? ` · updated ${day(source.updated_at)}` : ""}</dd></div><div><dt>Review note</dt><dd>{source.approval_note || "Not specified"}</dd></div><div><dt>Rights / access</dt><dd>{source.rights_or_access_note || "Not specified"}</dd></div></dl></details>{source.metadata?.resourceAudit && <p className="field-help" role="note">{[source.metadata.resourceAudit.checkedAt && `Automated check ${new Date(source.metadata.resourceAudit.checkedAt).toLocaleDateString()}: ${source.metadata.resourceAudit.checkedExcerpts ? `${source.metadata.resourceAudit.matchedExcerpts || 0}/${source.metadata.resourceAudit.checkedExcerpts} attached excerpts matched the page text` : "no attached excerpt could be compared"}. A text match does not verify a claim.`, source.metadata.resourceAudit.access !== "readable" ? source.rights_or_access_note : null, source.metadata.resourceAudit.parallelLabel, source.metadata.resourceAudit.evidenceNote].filter(Boolean).join(" ")}</p>}{source.metadata?.resourceAudit?.parallelUrl && <a className="resource-external" href={source.metadata.resourceAudit.parallelUrl} target="_blank" rel="noreferrer">{source.metadata.resourceAudit.parallelLinkLabel || "Open readable text"} <ArrowUpRight size={15}/></a>}{source.url && <a className="resource-external" href={source.url} target="_blank" rel="noreferrer">{source.metadata?.resourceAudit?.access && source.metadata.resourceAudit.access !== "readable" ? "Open original citation (access issue)" : "Open original source"} <ArrowUpRight size={15}/></a>}<details className="resource-detail-disclosure"><summary>Linked claims ({linkedClaims.get(source.id)?.length || 0})</summary>{(linkedClaims.get(source.id) || []).map(item => <button className="related-record" type="button" key={item.id} onClick={() => open({ kind: "claim", item })}>{item.claim_text}<ArrowUpRight size={14}/></button>)}{!linkedClaims.get(source.id)?.length && <p className="empty-note">No claims currently link to this source.</p>}</details><details className="resource-detail-disclosure"><summary>Passages ({chunksLoading ? "loading" : chunks.length}){source.source_status !== "approved" ? " · Add passage" : ""}</summary>{chunksLoading ? <p className="empty-note">Loading passages…</p> : chunks.map(chunk => <article className="passage" key={chunk.id}><small>{[chunk.page_or_section, chunk.textual_layer].filter(Boolean).join(" · ") || "Unlocated passage"}</small><p>{chunk.chunk_text}</p></article>)}{!chunksLoading && !chunks.length && <p className="empty-note">No passages have been added to this source.</p>}{source.source_status !== "approved" && <div className="passage-add"><Button variant="outline" size="sm" onClick={() => setShowPassage(value => !value)}>{showPassage ? "Cancel" : "Add passage"}</Button>{showPassage && <div className="sheet-fields"><label>Page or section (optional)<Input value={passageLocator} onChange={event => setPassageLocator(event.target.value)} maxLength={300} placeholder="Where this passage appears" disabled={busy}/></label><label>Passage text<Textarea value={passage} onChange={event => setPassage(event.target.value)} placeholder="Paste source text here" disabled={busy}/></label><p className="field-help">This adds text to the source and makes it available for research review.</p><Button disabled={busy || !passage.trim()} onClick={() => queueChange("Add this passage?", `The passage will be attached to ${source.title} and used in research review.`, "Add passage", () => api("/api/corpus/ingest", { method: "POST", headers: json, body: JSON.stringify({ sourceId: source.id, personalityIds: [personId], mode: "text", text: passage, pageOrSection: passageLocator || null, append: true }) }), "Passage added to the source.", "Adding passage and updating evidence…")}>{busy ? "Adding…" : "Add passage"}</Button></div>}</div>}</details></>}</>}
      {claim && <>{editing ? <div className="sheet-fields"><label>Claim text *<Textarea value={draft.claim_text || ""} onChange={event => setDraft(current => ({ ...current, claim_text: event.target.value }))} disabled={busy}/></label><label>Certainty<Select value={draft.certainty || "unknown"} onValueChange={value => setDraft(current => ({ ...current, certainty: value || "unknown" }))} disabled={busy}><SelectTrigger><SelectValue>{human(draft.certainty || "unknown")}</SelectValue></SelectTrigger><SelectContent>{["unknown", "high", "medium", "low"].map(value => <SelectItem key={value} value={value}>{human(value)}</SelectItem>)}</SelectContent></Select></label><label>Research notes<Textarea value={draft.researcher_notes || ""} onChange={event => setDraft(current => ({ ...current, researcher_notes: event.target.value }))} disabled={busy}/></label></div> : <div className="claim-view"><p>{claim.claim_text}</p>{claim.researcher_notes && <div><span className="section-label">Research notes</span><p>{claim.researcher_notes}</p></div>}</div>}<details className="resource-detail-disclosure"><summary>Claim classification</summary><dl className="detail-facts"><div><dt>Parameter</dt><dd>{claim.parameter_fields?.label || "Unassigned"}</dd></div><div><dt>Review</dt><dd>{claimReviewLabel(claim)}</dd></div><div><dt>Certainty</dt><dd>{human(claim.certainty)}</dd></div><div><dt>Claim kind</dt><dd>{human(claim.claim_kind)}</dd></div><div><dt>Evidence type</dt><dd>{human(claim.evidence_type || "unclassified")}</dd></div><div><dt>Knowledge type</dt><dd>{human(claim.epistemics?.epistemic_type || claim.epistemics?.proposed_type || "Unclassified").toLowerCase()}</dd></div></dl>{claim.epistemics?.contract_basis && <p className="field-help">Evidence assessment: {claim.epistemics.contract_basis}</p>}</details><details className="resource-detail-disclosure"><summary>Where this came from</summary><dl className="detail-facts"><div><dt>Held in</dt><dd>DCF Library{claim.review_status === "approved" ? "" : " (not yet used in answers)"}</dd></div><div><dt>Approved by</dt><dd>{claim.review_status === "approved" ? `${approvalBasis(claim.approval_origin, claim.approved_by_label)}${claim.approved_at ? ` · ${day(claim.approved_at)}` : ""}` : "Not approved"}</dd></div><div><dt>Added</dt><dd>{day(claim.created_at)}{claim.updated_at ? ` · updated ${day(claim.updated_at)}` : ""}</dd></div><div><dt>Sources</dt><dd>{[...new Set(claim.claim_sources.map(link => link.sources && sourceById.get(link.sources.id)).filter((item): item is Source => Boolean(item)).map(item => AUTHORITY_LABELS[sourceAuthority(item).level]))].join(", ") || "No linked source record"}</dd></div></dl><p className="field-help">{AUTHORITY_CAVEAT} Certainty and knowledge type are recorded separately under Claim classification.</p></details><h3 className="detail-section-title">Supporting evidence</h3>{claim.claim_sources.map(link => <article className="passage" key={link.id}><strong>{link.sources?.title || "Source"}</strong><small>{[human(link.relationship), link.page_or_section, link.sources && sourceById.has(link.sources.id) ? AUTHORITY_LABELS[sourceAuthority(sourceById.get(link.sources.id)!).level] : null].filter(Boolean).join(" · ")}</small>{link.evidence_excerpt && <p>{link.evidence_excerpt}</p>}{link.sources && sourceById.get(link.sources.id)?.metadata?.resourceAudit?.evidenceNote && <p className="field-help" role="note">Source check: {sourceById.get(link.sources.id)?.metadata?.resourceAudit?.evidenceNote}</p>}{link.sources && sourceById.has(link.sources.id) ? <button className="text-action" type="button" onClick={() => open({ kind: "source", item: sourceById.get(link.sources!.id)! })}>View source record <ArrowUpRight size={14}/></button> : link.sources?.url && <a href={link.sources.url} target="_blank" rel="noreferrer">Open original source ↗</a>}</article>)}{claim.claim_chunks.map((link, index) => <article className="passage" key={link.source_chunks?.id || index}><strong>{link.source_chunks?.sources?.title || "Source passage"}</strong><small>{[human(link.relationship), link.source_chunks?.page_or_section, link.source_chunks?.textual_layer && human(link.source_chunks.textual_layer)].filter(Boolean).join(" · ")}</small><p>{link.source_chunks?.chunk_text}</p>{link.source_chunks?.sources && sourceById.has(link.source_chunks.sources.id) && <button className="text-action" type="button" onClick={() => open({ kind: "source", item: sourceById.get(link.source_chunks!.sources!.id)! })}>View source record <ArrowUpRight size={14}/></button>}</article>)}{!claim.claim_sources.length && !claim.claim_chunks.length && <p className="empty-note">No evidence links have been added to this claim.</p>}{claim.claim_reviews.length > 0 && <details className="resource-detail-disclosure"><summary>Review history ({claim.claim_reviews.length})</summary>{claim.claim_reviews.map((entry, index) => <div className="review-entry" key={index}><strong>{human(entry.decision)}</strong> · {entry.reviewer_name.startsWith("system_") ? "Automated review" : entry.reviewer_name} · {new Date(entry.reviewed_at).toLocaleDateString()}{entry.notes && <p>{entry.notes}</p>}</div>)}</details>}</>}
    </div>
      <div className="sheet-actions">
        {activity && <p className="inline-progress" role="status"><LoaderCircle size={15} className="animate-spin"/>{activity}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {locked && <p className="field-help">Approved records must return to review before editing. Use “Return to review” below.</p>}
        {source && editing && <p className="field-help">Title is required. Source type is free text, and a URL may be entered with or without https://.</p>}
        {claim && editing && <p className="field-help">Claim text is required.</p>}
        {creating && <>
          <p className="field-help">Only a title is required. Add a URL, type, and other details when you have them.</p>
          <Button disabled={busy || draft.title?.trim().length < 2 || (!!draft.url?.trim() && !normalizedSourceUrl(draft.url))} onClick={() => queueChange("Create this source?", `${draft.title?.trim() || "This source"} will be added as a candidate.`, "Create candidate", () => api("/api/corpus/sources", { method: "POST", headers: json, body: JSON.stringify({ title: draft.title?.trim(), author: draft.author || null, publisherOrInstitution: draft.publisher_or_institution || null, sourceType: draft.source_type?.trim() || "other", url: normalizedSourceUrl(draft.url || ""), citation: draft.citation || null, textualLayer: draft.textual_layer || null, rightsOrAccessNote: draft.rights_or_access_note || null, personalityId: personId }) }), result => (result as { reused?: boolean }).reused ? "Existing source linked to this person. Open it to update details." : "Source added as a candidate for review.", "Creating source and refreshing list…")}>{busy ? "Creating…" : "Save for review"}</Button>
        </>}
        {source && <>
          {!locked && !editing && <Button variant="outline" disabled={busy} onClick={() => setEditing(true)}>Edit source</Button>}
          {editing && <><Button disabled={busy || draft.title?.trim().length < 2 || (!!draft.url?.trim() && !normalizedSourceUrl(draft.url))} onClick={saveSource}>{busy ? "Saving…" : "Save source"}</Button><Button variant="outline" disabled={busy} onClick={cancelEdit}>Cancel edit</Button></>}
          {!editing && <>
            {source.source_status === "candidate" && <Button variant="outline" disabled={busy} onClick={() => review("approved")}>Admit source</Button>}
            {source.source_status === "approved" && <Button variant="outline" disabled={busy} onClick={() => review("candidate")}>Return to review</Button>}
            {source.source_status === "rejected" ? <Button variant="outline" disabled={busy} onClick={() => review("candidate")}>Return to review</Button> : <Button variant="outline" disabled={busy} onClick={() => review("rejected")}>Reject</Button>}
            {canDelete && !chunksLoading && !error && <Button variant="ghost" disabled={busy} onClick={() => setConfirm({ kind: "delete" })}>Remove candidate</Button>}
            {source.source_status === "candidate" && !canDelete && !chunksLoading && <p className="field-help">This source has linked passages or claims, so it cannot be removed here.</p>}
          </>}
        </>}
        {claim && <>
          {!locked && !editing && <Button variant="outline" disabled={busy} onClick={() => setEditing(true)}>Edit claim</Button>}
          {editing && <><Button disabled={busy || draft.claim_text?.trim().length < 2} onClick={saveClaim}>{busy ? "Saving…" : "Save claim"}</Button><Button variant="outline" disabled={busy} onClick={cancelEdit}>Cancel edit</Button></>}
          {!editing && <>
            {claim.review_status !== "approved" && claim.review_status !== "rejected" && <Button variant="outline" disabled={busy} onClick={() => review("approved")}>Approve</Button>}
            {claim.review_status === "approved" && <Button variant="outline" disabled={busy} onClick={() => review("needs_review")}>Return to review</Button>}
            {claim.review_status === "rejected" ? <Button variant="outline" disabled={busy} onClick={() => review("needs_review")}>Return to review</Button> : <Button variant="outline" disabled={busy} onClick={() => review("rejected")}>Reject</Button>}
            {canDelete && <Button variant="ghost" disabled={busy} onClick={() => setConfirm({ kind: "delete" })}>Remove draft</Button>}
          </>}
        </>}
      </div></SheetContent></Sheet>
    <Dialog open={newClaim} onOpenChange={open => { if (!open && !busy && !pending) { setNewClaim(false); setError(""); } }}><DialogContent className="claim-dialog"><DialogHeader><DialogTitle>Add claim for {selectedName}</DialogTitle><DialogDescription>Create a draft linked to a source. Claim text, research field, source, and excerpt are required.</DialogDescription></DialogHeader>{activity && <p className="inline-progress" role="status"><LoaderCircle size={15} className="animate-spin"/>{activity}</p>}{!claimOptions ? <div className="claim-options-state" role="status">{claimOptionsLoading ? <><LoaderCircle size={17} className="animate-spin"/> Loading research fields…</> : <Button variant="outline" size="sm" onClick={() => void startClaim()}>Retry loading fields</Button>}</div> : <div className="sheet-fields"><label>Claim text *<Textarea value={claimDraft.text} onChange={event => setClaimDraft(current => ({ ...current, text: event.target.value }))} maxLength={4000} placeholder="State one claim that the source supports" disabled={busy}/></label><label>Research field *<Select value={claimDraft.fieldId || null} onValueChange={value => setClaimDraft(current => ({ ...current, fieldId: value || "" }))} disabled={busy}><SelectTrigger><SelectValue>{fieldOptions.find(field => field.id === claimDraft.fieldId)?.label || "Choose a research field"}</SelectValue></SelectTrigger><SelectContent>{fieldOptions.map(field => <SelectItem key={field.id} value={field.id}>{field.group} · {field.label}</SelectItem>)}</SelectContent></Select>{!fieldOptions.length && <span className="field-help">No research fields are configured for this person.</span>}</label><div className="claim-source-picker"><span className="claim-source-label">Supporting source *</span><div className="claim-source-modes" role="group" aria-label="Supporting source entry"><button type="button" aria-pressed={claimSourceMode === "existing"} className={claimSourceMode === "existing" ? "is-active" : ""} onClick={() => setClaimSourceMode("existing")}>Find existing</button><button type="button" aria-pressed={claimSourceMode === "new"} className={claimSourceMode === "new" ? "is-active" : ""} onClick={() => setClaimSourceMode("new")}>Enter new source</button></div>{claimSourceMode === "existing" ? <label>Search by title or website URL<Input list="claim-source-options" value={claimDraft.sourceQuery} onChange={event => { const value = event.target.value; const match = sources.find(item => item.source_status !== "rejected" && (sourceChoice(item) === value || item.url === value)); setClaimDraft(current => ({ ...current, sourceQuery: value, sourceId: match?.id || "" })); }} placeholder="Type a title or paste a source URL" disabled={busy}/><datalist id="claim-source-options">{sources.filter(item => item.source_status !== "rejected").map(item => <option key={item.id} value={sourceChoice(item)}/>)}</datalist><span className="field-help">Choose a suggestion to link an existing source.</span></label> : <div className="claim-new-source"><label>Source title *<Input value={claimDraft.newSourceTitle} onChange={event => setClaimDraft(current => ({ ...current, newSourceTitle: event.target.value }))} placeholder="Name of the page, book, or article" disabled={busy}/></label><label>Website or page URL (optional)<Input value={claimDraft.newSourceUrl} onChange={event => setClaimDraft(current => ({ ...current, newSourceUrl: event.target.value }))} placeholder="https://example.org/page or example.org/page" disabled={busy}/></label><label>Source type<Select value={claimDraft.newSourceType} onValueChange={value => setClaimDraft(current => ({ ...current, newSourceType: value || "other" }))} disabled={busy}><SelectTrigger><SelectValue>{human(claimDraft.newSourceType)}</SelectValue></SelectTrigger><SelectContent>{["other", "primary_text", "scholarly_article", "scholarly_book", "institutional"].map(value => <SelectItem key={value} value={value}>{human(value)}</SelectItem>)}</SelectContent></Select></label></div>}</div><details className="resource-detail-disclosure claim-optional-fields"><summary>Classification and certainty</summary><div className="claim-form-pair"><label>Claim kind<Select value={claimDraft.kind} onValueChange={value => setClaimDraft(current => ({ ...current, kind: value || "traditional_account" }))} disabled={busy}><SelectTrigger><SelectValue>{human(claimDraft.kind)}</SelectValue></SelectTrigger><SelectContent>{["traditional_account", "textual_tradition", "established_fact", "scholarly_interpretation", "contested"].map(value => <SelectItem key={value} value={value}>{human(value)}</SelectItem>)}</SelectContent></Select></label><label>Certainty<Select value={claimDraft.certainty} onValueChange={value => setClaimDraft(current => ({ ...current, certainty: value || "unknown" }))} disabled={busy}><SelectTrigger><SelectValue>{human(claimDraft.certainty)}</SelectValue></SelectTrigger><SelectContent>{["unknown", "high", "medium", "low"].map(value => <SelectItem key={value} value={value}>{human(value)}</SelectItem>)}</SelectContent></Select></label></div><label className="claim-optional-note">Research notes (optional)<Textarea value={claimDraft.notes} onChange={event => setClaimDraft(current => ({ ...current, notes: event.target.value }))} disabled={busy}/></label></details><label>Supporting excerpt *<Textarea value={claimDraft.excerpt} onChange={event => setClaimDraft(current => ({ ...current, excerpt: event.target.value }))} placeholder="Paste the relevant words from the source" disabled={busy}/></label><label>Page or section<Input value={claimDraft.locator} onChange={event => setClaimDraft(current => ({ ...current, locator: event.target.value }))} placeholder="For example, Bala Kanda 1.19" disabled={busy}/></label></div>}{error && <p className="form-error" role="alert">{error}</p>}<div className="claim-dialog-actions"><Button variant="outline" disabled={busy} onClick={() => setNewClaim(false)}>Cancel</Button><Button disabled={busy || !claimDraft.text.trim() || !claimDraft.fieldId || !(claimSourceMode === "existing" ? claimDraft.sourceId : claimDraft.newSourceTitle.trim().length >= 2 && (!claimDraft.newSourceUrl.trim() || normalizedSourceUrl(claimDraft.newSourceUrl))) || !claimDraft.excerpt.trim()} onClick={() => queueChange("Create this draft claim?", "The claim, supporting source, and excerpt will be saved for review.", "Create draft", () => api("/api/research/claim", { method: "POST", headers: json, body: JSON.stringify({ personalityId: personId, parameterFieldId: claimDraft.fieldId, claimText: claimDraft.text.trim(), claimKind: claimDraft.kind, certainty: claimDraft.certainty, researcherNotes: claimDraft.notes || null, existingSourceId: claimSourceMode === "existing" ? claimDraft.sourceId : undefined, sourceTitle: claimSourceMode === "new" ? claimDraft.newSourceTitle.trim() : undefined, sourceType: claimSourceMode === "new" ? claimDraft.newSourceType : undefined, sourceUrl: claimSourceMode === "new" ? normalizedSourceUrl(claimDraft.newSourceUrl) : undefined, evidenceExcerpt: claimDraft.excerpt.trim(), pageOrSection: claimDraft.locator || null, evidenceRelationship: "supports" }) }), "Draft claim added. It now appears in Claims.")}>{busy ? "Creating…" : "Create draft"}</Button></div></DialogContent></Dialog>
    <ConfirmResourceChange pending={pending} busy={busy} error={error} onCancel={() => { setPending(null); setError(""); }} onConfirm={() => void confirmChange()}/>
    <AlertDialog open={!!confirm} onOpenChange={open => { if (!open && !busy) { setConfirm(null); setReviewTarget(null); } }}><AlertDialogContent className="resource-review-dialog"><AlertDialogHeader><AlertDialogTitle>{confirm?.kind === "delete" ? "Remove this record?" : `${confirm?.status === "approved" ? "Approve" : confirm?.status === "rejected" ? "Reject" : "Return to review"} this ${(reviewTarget || detail)?.kind || "record"}?`}</AlertDialogTitle><AlertDialogDescription>{confirm?.kind === "delete" ? "This permanently removes an unlinked candidate source or draft claim." : "This updates the review state and records the reviewer. Claim decisions also appear in review history."}</AlertDialogDescription></AlertDialogHeader>{confirm?.kind === "review" && <div className="sheet-fields"><label>Reviewer name<Input value={reviewer} onChange={event => setReviewer(event.target.value)} maxLength={200} autoFocus/></label><label>Review note (optional)<Textarea value={reviewNote} onChange={event => setReviewNote(event.target.value)} maxLength={4000}/></label></div>}{error && <p className="form-error" role="alert">{error}</p>}<AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>{confirm?.kind === "delete" ? <AlertDialogAction disabled={busy} onClick={event => { event.preventDefault(); if (detail) void mutate(() => api("/api/resources", { method: "DELETE", headers: json, body: JSON.stringify({ kind: detail.kind, id: detail.item.id }) }), "Record removed."); }}>{busy ? "Removing…" : "Remove"}</AlertDialogAction> : <Button disabled={busy || !reviewer.trim()} onClick={() => void submitReview()}>{busy ? "Saving…" : "Confirm decision"}</Button>}</AlertDialogFooter></AlertDialogContent></AlertDialog>
  </main>;
}

function EmptyList({ filtered, rejected, kind, person, clear, add }: { filtered: boolean; rejected: boolean; kind: "sources" | "claims"; person: string; clear: () => void; add?: () => void }) {
  return <div className="resource-empty"><p>{filtered ? `No ${kind} match these filters.` : rejected ? `No rejected ${kind} for ${person}.` : `No ${kind} have been added for ${person} yet.`}</p>{filtered ? <Button variant="outline" size="sm" onClick={clear}>Clear filters</Button> : !rejected && add ? <Button variant="outline" size="sm" onClick={add}><Plus size={14}/> Add {kind === "sources" ? "source" : "claim"}</Button> : null}</div>;
}

function LoadingRows({ kind }: { kind: "sources" | "claims" }) {
  return <div className="resource-loading" role="status"><p>Loading {kind}…</p>{[0, 1, 2].map(index => <div className="resource-loading-row" key={index}><Skeleton className="h-4 w-2/3"/><Skeleton className="h-4 w-1/5"/></div>)}</div>;
}
