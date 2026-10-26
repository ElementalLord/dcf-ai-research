import Link from "next/link";
import { redirect } from "next/navigation";
import { hasAdminSession } from "@/lib/admin-session";
import { loadReadinessDashboard } from "@/lib/quality/dashboard";

export const dynamic = "force-dynamic";
const pct = (value: number | null) => value === null ? "Not run" : `${value}%`;
const sentence = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();

export default async function ReadinessPage() {
  if (!(await hasAdminSession())) redirect("/resources");
  const rows = await loadReadinessDashboard();
  const counts = rows.reduce<Record<string, number>>((result, row) => { result[row.publicationState] = (result[row.publicationState] || 0) + 1; return result; }, {});
  return <main className="resources-page readiness-page page-shell">

    <div className="readiness-heading"><div><h1>Personality readiness</h1><p>Live metrics for all {rows.length} personalities. Retrieval readiness is kept separate from human-verified publication readiness.</p></div><Link className="readiness-back" href="/resources">Back to Resources</Link></div>
    <div className="readiness-summary">{(["STRONG","USABLE","THIN","NEEDS ATTENTION"] as const).map(state => <div key={state}><strong>{counts[state] || 0}</strong><span>{sentence(state)}</span></div>)}</div>
    <p className="readiness-scroll-hint">Scroll the table to compare all measures.</p>
    <div className="readiness-table-wrap" role="region" aria-label="Personality readiness table" tabIndex={0}><table className="readiness-table"><thead><tr><th scope="col">Person</th><th scope="col">Retrieval</th><th scope="col">Publication</th><th scope="col">Sources / domains</th><th scope="col">Primary</th><th scope="col">Passages</th><th scope="col">Claims reviewed</th><th scope="col">Evidence quality</th><th scope="col">Evaluation</th><th scope="col">Main gaps</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.id}><td><strong>{row.name}</strong><small>{row.metrics.authoritativeSources} authoritative · {row.metrics.externalSearches} external calls</small></td><td><span className={`readiness-state state-${row.retrievalState.replace(" ", "-").toLowerCase()}`}>{sentence(row.retrievalState)}</span></td><td><span className={`readiness-state state-${row.publicationState.replace(" ", "-").toLowerCase()}`}>{sentence(row.publicationState)}</span></td><td>{row.metrics.sources} / {row.metrics.domains}<small>{row.domainConcentrationPercent}% largest-domain concentration</small></td><td>{row.metrics.primarySources}<small>{row.primaryCoveragePercent}% of sources</small></td><td>{row.metrics.passages}<small>{row.metrics.claimsWithPassages} approved claims linked</small></td><td>{row.metrics.approvedClaims + row.metrics.rejectedClaims} / {row.metrics.totalClaims}<small>{row.reviewedPercent}% final status</small></td><td>{row.evidenceQualityPercent}%</td><td>{pct(row.evaluationPassPercent)}<small>{row.metrics.evaluationQuestions ? `${pct(row.citationSupportPercent)} citation support · ${pct(row.retrievalSuccessPercent)} retrieval` : "Run the versioned suite"}</small></td><td><ul>{row.gaps.map(gap => <li key={gap}>{gap}</li>)}</ul></td></tr>)}</tbody></table></div>
    <p className="readiness-method">Thresholds require passage-level evidence, domain diversity, authoritative coverage, human review, and measured answer quality. A high source count alone cannot produce a strong rating.</p>
  </main>;
}
