import { redirect } from "next/navigation";
import { hasAdminSession } from "@/lib/admin-session";
import { supabaseAdmin } from "@/lib/supabase-admin";
import KnowledgeControls from "./knowledge-controls";
import HarvestActions from "./harvest-actions";
import ResourcesNav from "../resources-nav";
import "./knowledge.css";

export const dynamic = "force-dynamic";
type Policy = { request_limit_micro: number; daily_limit_micro: number; monthly_limit_micro: number;
  max_paid_calls: number; max_concurrent_jobs: number; research_paused: boolean; auto_admission_paused: boolean };
type Snapshot = { totalQuestions: number; localAnswers: number; researchAttempts: number; successfulResearch: number;
  unsuccessfulResearch: number; budgetExhaustions: number; machineApproved: number; humanApproved: number;
  suspendedMachine: number; quarantined: number; rejected: number; searchCalls: number; modelCalls: number;
  dailyCostMicro: number; monthlyCostMicro: number; monthlyAdmissions: number };
type Activity = { id: string; created_at: string; resolution_state: string | null; research_status: string | null;
  search_calls: number; verification_model_calls: number; admitted_count: number; estimated_cost_micro: number; latency_ms: number };
type Decision = { id: string; created_at: string; outcome: string; support: string; epistemic_type: string | null;
  reason_codes: string[]; source_work_keys: string[]; claim_id: string | null };
type Need = { need_id: string; status: string; outcome: { errorCategory?: string } | null; retry_after: string | null; updated_at: string };
type Source = { id: string; title: string; publisher_or_institution: string | null; url: string | null; source_status: string; rights_or_access_note: string | null };
type HarvestSnapshot = { sources: number; trusted: number; credible: number; promotionReady: number; promoted: number; rejected: number;
  findings: number; licensedFindings: number; runs30d: number; recallHits30d: number; searchesSaved30d: number };
type HarvestSource = { id: string; title: string; canonical_url: string; domain: string; publisher: string | null; evidence_type: string;
  authority_level: string; credibility_score: number; credibility_tier: string; credibility_signals: Array<{ key: string; points: number; detail: string }>;
  retention: string; status: string; times_seen: number; times_cited: number; distinct_questions: number; recall_hits: number; last_seen_at: string };
const HARVEST_VIEWS = { review: "Ready or active", ready: "Ready to add", trusted: "Trusted", promoted: "Added to Library", rejected: "Rejected" } as const;
const HARVEST_STATUS: Record<string, string> = { active: "Active", promotion_ready: "Ready to add", promoted: "In Library (candidate)", rejected: "Rejected" };
const words = (value: string) => value.replaceAll("_", " ");
const usd = (micro: number) => `$${(micro / 1_000_000).toFixed(3)}`;
const date = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ outcome?: string; harvest?: string }> }) {
  if (!(await hasAdminSession())) redirect("/resources");
  const params = await searchParams;
  const harvestView = (params.harvest && params.harvest in HARVEST_VIEWS ? params.harvest : "review") as keyof typeof HARVEST_VIEWS;
  const outcome = ["admitted", "quarantined", "rejected", "shadow", "duplicate"].includes(params.outcome || "") ? params.outcome! : "";
  const policyResult = await supabaseAdmin.from("demand_budget_policy")
    .select("request_limit_micro,daily_limit_micro,monthly_limit_micro,max_paid_calls,max_concurrent_jobs,research_paused,auto_admission_paused")
    .eq("id", true).maybeSingle();
  if (policyResult.error || !policyResult.data) return <main className="resources-page knowledge-page page-shell">
    <ResourcesNav current="knowledge"/>
    <p className="knowledge-empty">The demand budget migration is not available in this database. Apply the validated migrations before enabling research.</p>
  </main>;
  // The harvest tables arrive with their own migration; the rest of this page works without them.
  const harvestQuery = supabaseAdmin.from("knowledge_sources")
    .select("id,title,canonical_url,domain,publisher,evidence_type,authority_level,credibility_score,credibility_tier,credibility_signals,retention,status,times_seen,times_cited,distinct_questions,recall_hits,last_seen_at");
  const [harvestSnapshotResult, harvestSourcesResult] = await Promise.all([
    supabaseAdmin.rpc("knowledge_harvest_snapshot"),
    (harvestView === "ready" ? harvestQuery.eq("status", "promotion_ready")
      : harvestView === "trusted" ? harvestQuery.eq("credibility_tier", "trusted").neq("status", "rejected")
      : harvestView === "promoted" ? harvestQuery.eq("status", "promoted")
      : harvestView === "rejected" ? harvestQuery.eq("status", "rejected")
      : harvestQuery.in("status", ["promotion_ready", "active"]))
      .order("status", { ascending: false }).order("credibility_score", { ascending: false }).order("last_seen_at", { ascending: false }).limit(50),
  ]);
  const harvestAvailable = !harvestSnapshotResult.error && !harvestSourcesResult.error;
  const harvest = (harvestSnapshotResult.data || {}) as HarvestSnapshot;
  const harvestSources = (harvestSourcesResult.data || []) as HarvestSource[];
  const [snapshotResult, activityResult, decisionsResult, needsResult, sourcesResult] = await Promise.all([
    supabaseAdmin.rpc("demand_oversight_snapshot"),
    supabaseAdmin.from("demand_question_activity").select("id,created_at,resolution_state,research_status,search_calls,verification_model_calls,admitted_count,estimated_cost_micro,latency_ms")
      .order("created_at", { ascending: false }).limit(30),
    (outcome ? supabaseAdmin.from("demand_verification_decisions").select("id,created_at,outcome,support,epistemic_type,reason_codes,source_work_keys,claim_id").eq("outcome", outcome)
      : supabaseAdmin.from("demand_verification_decisions").select("id,created_at,outcome,support,epistemic_type,reason_codes,source_work_keys,claim_id"))
      .order("created_at", { ascending: false }).limit(30),
    supabaseAdmin.from("demand_research_needs").select("need_id,status,outcome,retry_after,updated_at")
      .order("updated_at", { ascending: false }).limit(15),
    supabaseAdmin.from("sources").select("id,title,publisher_or_institution,url,source_status,rights_or_access_note")
      .eq("approval_origin", "automated_evidence_verification").order("approved_at", { ascending: false }).limit(15),
  ]);
  if (snapshotResult.error || activityResult.error || decisionsResult.error || needsResult.error || sourcesResult.error)
    throw new Error("Knowledge engine oversight could not be loaded.");
  const summary = snapshotResult.data as Snapshot;
  const policy = policyResult.data as Policy;
  const activities = (activityResult.data || []) as Activity[];
  const decisions = (decisionsResult.data || []) as Decision[];
  const needs = (needsResult.data || []) as Need[];
  const sources = (sourcesResult.data || []) as Source[];
  const localRate = summary.totalQuestions ? Math.round(summary.localAnswers / summary.totalQuestions * 100) : null;
  const costPerAdmission = summary.monthlyAdmissions ? summary.monthlyCostMicro / summary.monthlyAdmissions : null;

  return <main className="resources-page knowledge-page page-shell">
    <ResourcesNav current="knowledge"/>
    <section className="knowledge-section" aria-labelledby="knowledge-summary"><h2 id="knowledge-summary">Activity</h2>
      <dl className="knowledge-facts">
        <div><dt>Questions recorded</dt><dd>{summary.totalQuestions}</dd></div>
        <div><dt>Resolved locally</dt><dd>{summary.localAnswers}{localRate !== null && ` (${localRate}%)`}</dd></div>
        <div><dt>Research attempts</dt><dd>{summary.researchAttempts}</dd></div>
        <div><dt>Research with usable findings</dt><dd>{summary.successfulResearch}</dd></div>
        <div><dt>Insufficient or failed</dt><dd>{summary.unsuccessfulResearch}</dd></div>
        <div><dt>Budget limits reached</dt><dd>{summary.budgetExhaustions}</dd></div>
      </dl>
      <div className="knowledge-table-wrap"><table><thead><tr><th>Time</th><th>Resolution</th><th>Research</th><th>Searches</th><th>Verification calls</th><th>Admitted</th><th>Estimated cost</th><th>Latency</th></tr></thead><tbody>
        {activities.map(row => <tr key={row.id}><td>{date(row.created_at)}</td><td>{row.resolution_state || "—"}</td><td>{row.research_status || "Local"}</td><td>{row.search_calls}</td><td>{row.verification_model_calls}</td><td>{row.admitted_count}</td><td>{usd(row.estimated_cost_micro)}</td><td>{row.latency_ms} ms</td></tr>)}
        {!activities.length && <tr><td colSpan={8}>No question activity recorded yet.</td></tr>}
      </tbody></table></div>
    </section>
    <section className="knowledge-section" aria-labelledby="knowledge-costs"><h2 id="knowledge-costs">Research costs</h2>
      <dl className="knowledge-facts"><div><dt>Today (UTC)</dt><dd>{usd(summary.dailyCostMicro)}</dd></div><div><dt>This month (UTC)</dt><dd>{usd(summary.monthlyCostMicro)}</dd></div>
        <div><dt>Search calls</dt><dd>{summary.searchCalls}</dd></div><div><dt>Model calls</dt><dd>{summary.modelCalls}</dd></div>
        <div><dt>Cost per admitted claim this month</dt><dd>{costPerAdmission === null ? "—" : usd(costPerAdmission)}</dd></div></dl>
      <p className="knowledge-note">Costs are estimates from configured rates and reported provider tokens. Check provider billing separately.</p>
      <KnowledgeControls policy={policy}/>
    </section>
    <section className="knowledge-section" aria-labelledby="knowledge-harvest"><div className="knowledge-section-head"><h2 id="knowledge-harvest">Source harvest</h2>
      {harvestAvailable && <form action="/resources/knowledge" method="get"><label>Show <select name="harvest" defaultValue={harvestView}>{Object.entries(HARVEST_VIEWS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button type="submit">Filter</button></form>}</div>
      {harvestAvailable ? <>
        <p className="knowledge-note">Every answer that uses live search records the works it read, scores each for credibility, and remembers which passages supported the question. Remembered sources are re-read before any paid search. Nothing here is approved: adding a source to the Library creates a candidate for normal review.</p>
        <dl className="knowledge-facts">
          <div><dt>Works recorded</dt><dd>{harvest.sources}</dd></div>
          <div><dt>Trusted</dt><dd>{harvest.trusted}</dd></div>
          <div><dt>Credible</dt><dd>{harvest.credible}</dd></div>
          <div><dt>Ready to add</dt><dd>{harvest.promotionReady}</dd></div>
          <div><dt>Passages indexed</dt><dd>{harvest.findings}</dd></div>
          <div><dt>Answers harvested (30 days)</dt><dd>{harvest.runs30d}</dd></div>
          <div><dt>Paid searches avoided (30 days)</dt><dd>{harvest.searchesSaved30d}</dd></div>
        </dl>
        <div className="knowledge-table-wrap"><table><thead><tr><th>Work</th><th>Credibility</th><th>Type</th><th>Use</th><th>Status</th><th>Decision</th></tr></thead><tbody>
          {harvestSources.map(row => <tr key={row.id}>
            <td><a href={row.canonical_url} target="_blank" rel="noopener noreferrer">{row.title}</a><small className="harvest-sub">{row.publisher || row.domain}</small></td>
            <td><details className="harvest-why"><summary><span className={`harvest-tier harvest-tier-${row.credibility_tier}`}>{row.credibility_score} · {row.credibility_tier}</span></summary>
              <ul>{row.credibility_signals.map(signal => <li key={signal.key}>{signal.points > 0 ? "+" : ""}{signal.points} {signal.detail}</li>)}</ul></details></td>
            <td>{words(row.evidence_type)}<small className="harvest-sub">{row.retention === "licensed_excerpt" ? "Open licence: passages kept" : "Pointer only: no text kept"}</small></td>
            <td>{row.distinct_questions} question{row.distinct_questions === 1 ? "" : "s"} · cited {row.times_cited}<small className="harvest-sub">Reused {row.recall_hits} · last seen {date(row.last_seen_at)}</small></td>
            <td>{HARVEST_STATUS[row.status] || row.status}</td>
            <td><HarvestActions sourceId={row.id} status={row.status}/></td>
          </tr>)}
          {!harvestSources.length && <tr><td colSpan={6}>No harvested sources match this view yet. They appear after an answer uses live search.</td></tr>}
        </tbody></table></div>
      </> : <p className="knowledge-empty">Source harvesting is not available in this database yet. Apply the migration <code>20261113010000_knowledge_harvest.sql</code> to start recording what live search finds.</p>}
    </section>
    <section className="knowledge-section" aria-labelledby="knowledge-decisions"><div className="knowledge-section-head"><h2 id="knowledge-decisions">Verification decisions</h2>
      <form action="/resources/knowledge" method="get"><label>Outcome <select name="outcome" defaultValue={outcome}><option value="">All</option>{["admitted","quarantined","rejected","shadow","duplicate"].map(value => <option key={value} value={value}>{value}</option>)}</select></label><button type="submit">Filter</button></form></div>
      <dl className="knowledge-facts"><div><dt>Machine approved</dt><dd>{summary.machineApproved}</dd></div><div><dt>Human or Mentor approved</dt><dd>{summary.humanApproved}</dd></div>
        <div><dt>Quarantined</dt><dd>{summary.quarantined}</dd></div><div><dt>Rejected</dt><dd>{summary.rejected}</dd></div><div><dt>Suspended machine claims</dt><dd>{summary.suspendedMachine}</dd></div></dl>
      <div className="knowledge-table-wrap"><table><thead><tr><th>Time</th><th>Decision</th><th>Epistemic type</th><th>Support</th><th>Reason</th><th>Work identity</th><th>Claim</th></tr></thead><tbody>
        {decisions.map(row => <tr key={row.id}><td>{date(row.created_at)}</td><td>{row.outcome}</td><td>{row.epistemic_type || "—"}</td><td>{row.support}</td><td>{row.reason_codes.join("; ") || "—"}</td><td>{row.source_work_keys.join(", ") || "—"}</td><td>{row.claim_id || "—"}</td></tr>)}
        {!decisions.length && <tr><td colSpan={7}>No decisions match this filter.</td></tr>}
      </tbody></table></div>
    </section>
    <section className="knowledge-section" aria-labelledby="knowledge-needs"><h2 id="knowledge-needs">Research reuse and cooldowns</h2>
      <div className="knowledge-table-wrap"><table><thead><tr><th>Updated</th><th>Need</th><th>Status</th><th>Failure or constraint</th><th>Retry eligible</th></tr></thead><tbody>
        {needs.map(row => <tr key={row.need_id}><td>{date(row.updated_at)}</td><td><code>{row.need_id.slice(0, 12)}</code></td><td>{row.status}</td><td>{row.outcome?.errorCategory || "—"}</td><td>{row.retry_after ? date(row.retry_after) : "Now"}</td></tr>)}
        {!needs.length && <tr><td colSpan={5}>No research needs recorded yet.</td></tr>}
      </tbody></table></div>
    </section>
    <section className="knowledge-section" aria-labelledby="knowledge-sources"><h2 id="knowledge-sources">Recently admitted sources</h2>
      <div className="knowledge-table-wrap"><table><thead><tr><th>Source</th><th>Publisher</th><th>Status</th><th>Retention declaration</th></tr></thead><tbody>
        {sources.map(row => <tr key={row.id}><td>{row.url ? <a href={row.url} target="_blank" rel="noopener noreferrer">{row.title}</a> : row.title}</td><td>{row.publisher_or_institution || "—"}</td><td>{row.source_status}</td><td>{row.rights_or_access_note || "—"}</td></tr>)}
        {!sources.length && <tr><td colSpan={4}>No machine-admitted sources yet.</td></tr>}
      </tbody></table></div>
    </section>
  </main>;
}
