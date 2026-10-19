import Link from "next/link";
import { redirect } from "next/navigation";
import { hasAdminSession } from "@/lib/admin-session";
import { supabaseAdmin } from "@/lib/supabase-admin";
import KnowledgeControls from "./knowledge-controls";
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
const usd = (micro: number) => `$${(micro / 1_000_000).toFixed(3)}`;
const date = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ outcome?: string }> }) {
  if (!(await hasAdminSession())) redirect("/resources");
  const params = await searchParams;
  const outcome = ["admitted", "quarantined", "rejected", "shadow", "duplicate"].includes(params.outcome || "") ? params.outcome! : "";
  const policyResult = await supabaseAdmin.from("demand_budget_policy")
    .select("request_limit_micro,daily_limit_micro,monthly_limit_micro,max_paid_calls,max_concurrent_jobs,research_paused,auto_admission_paused")
    .eq("id", true).maybeSingle();
  if (policyResult.error || !policyResult.data) return <main className="resources-page knowledge-page page-shell">
    <div className="knowledge-heading"><h1>Knowledge engine</h1><Link href="/resources">Back to Resources</Link></div>
    <p className="knowledge-empty">The demand budget migration is not available in this database. Apply the validated migrations before enabling research.</p>
  </main>;
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
    <div className="knowledge-heading"><div><h1>Knowledge engine</h1><p>Question-triggered research, admission and spending.</p></div><Link href="/resources">Back to Resources</Link></div>
    <nav className="knowledge-nav" aria-label="Resource areas"><Link href="/resources">Sources and claims</Link><Link href="/resources/feedback">Feedback</Link><Link href="/resources/readiness">Readiness</Link></nav>
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
