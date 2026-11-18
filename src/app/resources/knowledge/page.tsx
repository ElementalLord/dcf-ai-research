import { redirect } from "next/navigation";
import { hasAdminSession } from "@/lib/admin-session";
import { supabaseAdmin } from "@/lib/supabase-admin";
import KnowledgeControls from "./knowledge-controls";
import HarvestActions from "./harvest-actions";
import ResourcesNav from "../resources-nav";
import { Expandable } from "@/components/expandable";
import "./knowledge.css";

export const dynamic = "force-dynamic";
type Policy = { request_limit_micro: number; daily_limit_micro: number; monthly_limit_micro: number;
  max_paid_calls: number; max_concurrent_jobs: number; research_paused: boolean; auto_admission_paused: boolean };
type Snapshot = { totalQuestions: number; localAnswers: number; researchAttempts: number; successfulResearch: number;
  unsuccessfulResearch: number; budgetExhaustions: number; machineApproved: number; humanApproved: number;
  suspendedMachine: number; quarantined: number; rejected: number; searchCalls: number; modelCalls: number;
  dailyCostMicro: number; monthlyCostMicro: number; monthlyAdmissions: number };
type HarvestSnapshot = { sources: number; trusted: number; credible: number; promotionReady: number; promoted: number; rejected: number;
  findings: number; licensedFindings: number; runs30d: number; recallHits30d: number; searchesSaved30d: number;
  autoClaims?: number; autoClaims30d?: number; autoHeld30d?: number; autoSuspended?: number };
type HarvestSource = { id: string; title: string; canonical_url: string; domain: string; publisher: string | null; evidence_type: string;
  authority_level: string; credibility_score: number; credibility_tier: string; credibility_signals: Array<{ key: string; points: number; detail: string }>;
  retention: string; status: string; times_seen: number; times_cited: number; distinct_questions: number; recall_hits: number; last_seen_at: string };
const HARVEST_VIEWS = { review: "Recorded, not yet in Library", ready: "Used repeatedly", trusted: "Trusted", promoted: "In Library", rejected: "Rejected" } as const;
const HARVEST_STATUS: Record<string, string> = { active: "Recorded", promotion_ready: "Used repeatedly", promoted: "In Library", rejected: "Rejected" };
const words = (value: string) => value.replaceAll("_", " ");
const usd = (micro: number) => `$${(micro / 1_000_000).toFixed(3)}`;
const date = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ harvest?: string }> }) {
  if (!(await hasAdminSession())) redirect("/resources");
  const params = await searchParams;
  const harvestView = (params.harvest && params.harvest in HARVEST_VIEWS ? params.harvest : "review") as keyof typeof HARVEST_VIEWS;
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
  const snapshotResult = await supabaseAdmin.rpc("demand_oversight_snapshot");
  if (snapshotResult.error) throw new Error("Knowledge engine oversight could not be loaded.");
  const summary = snapshotResult.data as Snapshot;
  const policy = policyResult.data as Policy;
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
        <p className="knowledge-note">This runs on its own. Every answer that uses live search records the works it read and scores each for credibility. Facts that pass every check (two independent credible works, or one trusted authoritative work, plus an exact-match and entailment check) are published as verified claims with no reviewer. Remembered sources are re-read before any paid search. The controls below are optional: rejecting a source stops its reuse and withdraws the claims that rest on it, and &ldquo;Pause automatic admission&rdquo; above stops new claims.</p>
        <dl className="knowledge-facts">
          <div><dt>Works recorded</dt><dd>{harvest.sources}</dd></div>
          <div><dt>Trusted</dt><dd>{harvest.trusted}</dd></div>
          <div><dt>Credible</dt><dd>{harvest.credible}</dd></div>
          <div><dt>Passages indexed</dt><dd>{harvest.findings}</dd></div>
          <div><dt>Claims published automatically</dt><dd>{harvest.autoClaims ?? 0}</dd></div>
          <div><dt>Published (30 days)</dt><dd>{harvest.autoClaims30d ?? 0}</dd></div>
          <div><dt>Held back (30 days)</dt><dd>{harvest.autoHeld30d ?? 0}</dd></div>
          <div><dt>Withdrawn</dt><dd>{harvest.autoSuspended ?? 0}</dd></div>
          <div><dt>Answers harvested (30 days)</dt><dd>{harvest.runs30d}</dd></div>
          <div><dt>Paid searches avoided (30 days)</dt><dd>{harvest.searchesSaved30d}</dd></div>
        </dl>
        <Expandable noun="rows"><div className="knowledge-table-wrap"><table><thead><tr><th>Work</th><th>Credibility</th><th>Type</th><th>Use</th><th>Status</th><th>Decision</th></tr></thead><tbody>
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
        </tbody></table></div></Expandable>
      </> : <p className="knowledge-empty">Source harvesting is not available in this database yet. Apply the migration <code>20261113010000_knowledge_harvest.sql</code> to start recording what live search finds.</p>}
    </section>
    <p className="knowledge-note">The run log, every verification decision, research cooldowns and machine-admitted sources are in <a href="/resources/diagnostics">Extra diagnostics</a>.</p>
  </main>;
}
