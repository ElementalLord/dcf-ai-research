import { redirect } from "next/navigation";
import { hasAdminSession } from "@/lib/admin-session";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { loadReadinessDashboard } from "@/lib/quality/dashboard";
import ResourcesNav from "../resources-nav";
import { Expandable } from "@/components/expandable";
import "../knowledge/knowledge.css";

export const dynamic = "force-dynamic";

/**
 * Extra diagnostics: the detailed, computed tables that day-to-day editing does not need.
 * Readiness scores, the knowledge engine's run log, every automatic verification decision,
 * research cooldowns and machine-admitted sources. Each part loads on its own, so one missing
 * table never hides the rest.
 */
type Activity = { id: string; created_at: string; resolution_state: string | null; research_status: string | null;
  search_calls: number; verification_model_calls: number; admitted_count: number; estimated_cost_micro: number; latency_ms: number };
type Decision = { id: string; created_at: string; outcome: string; support: string; epistemic_type: string | null;
  reason_codes: string[]; source_work_keys: string[]; claim_id: string | null };
type Need = { need_id: string; status: string; outcome: { errorCategory?: string } | null; retry_after: string | null; updated_at: string };
type Source = { id: string; title: string; publisher_or_institution: string | null; url: string | null; source_status: string; rights_or_access_note: string | null };
type Snapshot = { machineApproved: number; humanApproved: number; suspendedMachine: number; quarantined: number; rejected: number };

const OUTCOMES = ["admitted", "quarantined", "rejected", "shadow", "duplicate"];
const usd = (micro: number) => `$${(micro / 1_000_000).toFixed(3)}`;
const date = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const pct = (value: number | null) => value === null ? "Not run" : `${value}%`;
const sentence = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();

function Unavailable({ what }: { what: string }) {
  return <p className="knowledge-empty">{what} could not be loaded from the database.</p>;
}

export default async function DiagnosticsPage({ searchParams }: { searchParams: Promise<{ outcome?: string }> }) {
  if (!(await hasAdminSession())) redirect("/resources");
  const params = await searchParams;
  const outcome = OUTCOMES.includes(params.outcome || "") ? params.outcome! : "";
  const decisionQuery = supabaseAdmin.from("demand_verification_decisions").select("id,created_at,outcome,support,epistemic_type,reason_codes,source_work_keys,claim_id");

  const [readiness, snapshotResult, activityResult, decisionsResult, needsResult, sourcesResult] = await Promise.all([
    loadReadinessDashboard().catch(() => null),
    supabaseAdmin.rpc("demand_oversight_snapshot"),
    supabaseAdmin.from("demand_question_activity").select("id,created_at,resolution_state,research_status,search_calls,verification_model_calls,admitted_count,estimated_cost_micro,latency_ms")
      .order("created_at", { ascending: false }).limit(30),
    (outcome ? decisionQuery.eq("outcome", outcome) : decisionQuery).order("created_at", { ascending: false }).limit(30),
    supabaseAdmin.from("demand_research_needs").select("need_id,status,outcome,retry_after,updated_at").order("updated_at", { ascending: false }).limit(15),
    supabaseAdmin.from("sources").select("id,title,publisher_or_institution,url,source_status,rights_or_access_note")
      .eq("approval_origin", "automated_evidence_verification").order("approved_at", { ascending: false }).limit(15),
  ]);
  const summary = (snapshotResult.error ? null : snapshotResult.data) as Snapshot | null;
  const activities = (activityResult.data || []) as Activity[];
  const decisions = (decisionsResult.data || []) as Decision[];
  const needs = (needsResult.data || []) as Need[];
  const sources = (sourcesResult.data || []) as Source[];
  const counts = (readiness || []).reduce<Record<string, number>>((result, row) => { result[row.publicationState] = (result[row.publicationState] || 0) + 1; return result; }, {});

  return <main className="resources-page knowledge-page diagnostics-page page-shell">
    <ResourcesNav current="diagnostics"/>

    <details data-tour="readiness" className="knowledge-section diagnostics-block" open>
      <summary><h2>Profile readiness</h2><span>How much evidence each person has</span></summary>
      {readiness ? <>
        <dl className="knowledge-facts">{(["STRONG", "USABLE", "THIN", "NEEDS ATTENTION"] as const).map(state => <div key={state}><dt>{sentence(state)}</dt><dd>{counts[state] || 0}</dd></div>)}</dl>
        <Expandable noun="rows"><div className="knowledge-table-wrap" role="region" aria-label="Personality readiness table" tabIndex={0}><table><thead><tr><th>Person</th><th>Retrieval</th><th>Publication</th><th>Sources / domains</th><th>Primary</th><th>Passages</th><th>Claims reviewed</th><th>Evidence quality</th><th>Evaluation</th><th>Main gaps</th></tr></thead>
          <tbody>{readiness.map(row => <tr key={row.id}><td><strong>{row.name}</strong><small className="harvest-sub">{row.metrics.authoritativeSources} authoritative · {row.metrics.externalSearches} external calls</small></td><td>{sentence(row.retrievalState)}</td><td>{sentence(row.publicationState)}</td><td>{row.metrics.sources} / {row.metrics.domains}<small className="harvest-sub">{row.domainConcentrationPercent}% from the largest domain</small></td><td>{row.metrics.primarySources}<small className="harvest-sub">{row.primaryCoveragePercent}% of sources</small></td><td>{row.metrics.passages}<small className="harvest-sub">{row.metrics.claimsWithPassages} approved claims linked</small></td><td>{row.metrics.approvedClaims + row.metrics.rejectedClaims} / {row.metrics.totalClaims}<small className="harvest-sub">{row.reviewedPercent}% decided</small></td><td>{row.evidenceQualityPercent}%</td><td>{pct(row.evaluationPassPercent)}<small className="harvest-sub">{row.metrics.evaluationQuestions ? `${pct(row.citationSupportPercent)} citation support · ${pct(row.retrievalSuccessPercent)} retrieval` : "Suite not run"}</small></td><td>{row.gaps.join(" ") || "—"}</td></tr>)}</tbody></table></div></Expandable>
        <p className="knowledge-note">A high source count alone cannot produce a strong rating: it also needs passage-level evidence, several domains, authoritative coverage, human review and measured answer quality.</p>
      </> : <Unavailable what="Readiness scores"/>}
    </details>

    <details data-tour="runs" className="knowledge-section diagnostics-block">
      <summary><h2>Research run log</h2><span>The last 30 questions</span></summary>
      {activityResult.error ? <Unavailable what="The run log"/> : <Expandable noun="rows"><div className="knowledge-table-wrap"><table><thead><tr><th>Time</th><th>Resolution</th><th>Research</th><th>Searches</th><th>Verification calls</th><th>Admitted</th><th>Estimated cost</th><th>Latency</th></tr></thead><tbody>
        {activities.map(row => <tr key={row.id}><td>{date(row.created_at)}</td><td>{row.resolution_state || "—"}</td><td>{row.research_status || "Local"}</td><td>{row.search_calls}</td><td>{row.verification_model_calls}</td><td>{row.admitted_count}</td><td>{usd(row.estimated_cost_micro)}</td><td>{row.latency_ms} ms</td></tr>)}
        {!activities.length && <tr><td colSpan={8}>No question activity recorded yet.</td></tr>}
      </tbody></table></div></Expandable>}
    </details>

    <details data-tour="decisions" className="knowledge-section diagnostics-block" open={Boolean(outcome)}>
      <summary><h2>Verification decisions</h2><span>Every automatic decision and its reason</span></summary>
      <form action="/resources/diagnostics" method="get" className="diagnostics-filter"><label>Outcome <select name="outcome" defaultValue={outcome}><option value="">All</option>{OUTCOMES.map(value => <option key={value} value={value}>{value}</option>)}</select></label><button type="submit" className="key">Filter</button></form>
      {summary && <dl className="knowledge-facts"><div><dt>Machine approved</dt><dd>{summary.machineApproved}</dd></div><div><dt>Human or Mentor approved</dt><dd>{summary.humanApproved}</dd></div>
        <div><dt>Quarantined</dt><dd>{summary.quarantined}</dd></div><div><dt>Rejected</dt><dd>{summary.rejected}</dd></div><div><dt>Suspended machine claims</dt><dd>{summary.suspendedMachine}</dd></div></dl>}
      {decisionsResult.error ? <Unavailable what="Verification decisions"/> : <Expandable noun="rows"><div className="knowledge-table-wrap"><table><thead><tr><th>Time</th><th>Decision</th><th>Epistemic type</th><th>Support</th><th>Reason</th><th>Work identity</th><th>Claim</th></tr></thead><tbody>
        {decisions.map(row => <tr key={row.id}><td>{date(row.created_at)}</td><td>{row.outcome}</td><td>{row.epistemic_type || "—"}</td><td>{row.support}</td><td>{row.reason_codes.join("; ") || "—"}</td><td>{row.source_work_keys.join(", ") || "—"}</td><td>{row.claim_id || "—"}</td></tr>)}
        {!decisions.length && <tr><td colSpan={7}>No decisions match this filter.</td></tr>}
      </tbody></table></div></Expandable>}
    </details>

    <details data-tour="cooldowns" className="knowledge-section diagnostics-block">
      <summary><h2>Research reuse and cooldowns</h2><span>Topics waiting before they are searched again</span></summary>
      {needsResult.error ? <Unavailable what="Research cooldowns"/> : <Expandable noun="rows"><div className="knowledge-table-wrap"><table><thead><tr><th>Updated</th><th>Need</th><th>Status</th><th>Failure or constraint</th><th>Retry eligible</th></tr></thead><tbody>
        {needs.map(row => <tr key={row.need_id}><td>{date(row.updated_at)}</td><td><code>{row.need_id.slice(0, 12)}</code></td><td>{row.status}</td><td>{row.outcome?.errorCategory || "—"}</td><td>{row.retry_after ? date(row.retry_after) : "Now"}</td></tr>)}
        {!needs.length && <tr><td colSpan={5}>No research needs recorded yet.</td></tr>}
      </tbody></table></div></Expandable>}
    </details>

    <details data-tour="machine" className="knowledge-section diagnostics-block">
      <summary><h2>Machine-admitted sources</h2><span>The 15 most recent</span></summary>
      {sourcesResult.error ? <Unavailable what="Machine-admitted sources"/> : <Expandable noun="rows"><div className="knowledge-table-wrap"><table><thead><tr><th>Source</th><th>Publisher</th><th>Status</th><th>Retention declaration</th></tr></thead><tbody>
        {sources.map(row => <tr key={row.id}><td>{row.url ? <a href={row.url} target="_blank" rel="noopener noreferrer">{row.title}</a> : row.title}</td><td>{row.publisher_or_institution || "—"}</td><td>{row.source_status}</td><td>{row.rights_or_access_note || "—"}</td></tr>)}
        {!sources.length && <tr><td colSpan={4}>No machine-admitted sources yet.</td></tr>}
      </tbody></table></div></Expandable>}
    </details>
  </main>;
}
