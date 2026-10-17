import Link from "next/link";
import { redirect } from "next/navigation";
import { hasAdminSession } from "@/lib/admin-session";
import { feedbackTags } from "@/lib/feedback";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
type Params = { rating?: string; personality?: string; tag?: string; recent?: string; search?: string; page?: string };
type Citation = { id: string; kind: string; title: string; url: string | null; claimId?: string; chunkId?: string; pageOrSection: string | null };
type FeedbackRow = { id: string; created_at: string; response_id: string; request_id: string | null; rating: number; comment: string | null; feedback_tags: string[]; question: string; answer_snapshot: string; citations: Citation[]; citation_count: number; personality_name: string; used_live_search: boolean; answer_mode: string; provider: string | null; model: string | null };
const date = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const recentCutoff = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<Params> }) {
  if (!(await hasAdminSession())) redirect("/resources");
  const params = await searchParams;
  const rating = ["1", "2", "3", "4", "5", "low"].includes(params.rating || "") ? params.rating! : "";
  const tag = feedbackTags.find(item => item === params.tag) || "";
  const recent = ["7", "30", "90"].includes(params.recent || "") ? params.recent! : "";
  const search = ["live", "local"].includes(params.search || "") ? params.search! : "";
  const personality = /^[0-9a-f-]{36}$/i.test(params.personality || "") ? params.personality! : "";
  const page = Math.max(1, Math.min(1000, Number.parseInt(params.page || "1", 10) || 1));
  const [counts, people] = await Promise.all([
    Promise.all([1, 2, 3, 4, 5].map(value => supabaseAdmin.from("response_feedback").select("id", { count: "exact", head: true }).eq("rating", value))),
    supabaseAdmin.from("personalities").select("id,canonical_name").order("canonical_name"),
  ]);
  const countError = counts.find(result => result.error)?.error;
  if (countError || people.error) throw new Error("Feedback summary could not be loaded.");
  const distribution = counts.map(result => result.count || 0);
  const total = distribution.reduce((sum, value) => sum + value, 0);
  const average = total ? distribution.reduce((sum, value, index) => sum + value * (index + 1), 0) / total : null;

  let query = supabaseAdmin.from("response_feedback").select("id,created_at,response_id,request_id,rating,comment,feedback_tags,question,answer_snapshot,citations,citation_count,personality_name,used_live_search,answer_mode,provider,model", { count: "exact" });
  if (rating === "low") query = query.lte("rating", 2);
  else if (rating) query = query.eq("rating", Number(rating));
  if (personality) query = query.eq("personality_id", personality);
  if (tag) query = query.contains("feedback_tags", [tag]);
  if (recent) query = query.gte("created_at", recentCutoff(Number(recent)));
  if (search) query = query.eq("used_live_search", search === "live");
  const { data, error, count } = await query.order("created_at", { ascending: false }).range((page - 1) * 50, page * 50 - 1);
  if (error) throw new Error("Feedback entries could not be loaded.");
  const rows = (data || []) as FeedbackRow[];
  const filteredCount = count || 0;
  const pages = Math.max(1, Math.ceil(filteredCount / 50));
  const hrefFor = (next: number) => `/resources/feedback?${new URLSearchParams({ ...(rating && { rating }), ...(personality && { personality }), ...(tag && { tag }), ...(recent && { recent }), ...(search && { search }), page: String(next) })}`;

  return <main className="resources-page feedback-page page-shell">
    <div className="page-kicker">RESOURCES</div>
    <div className="resource-heading"><div><p className="section-label">Team review</p><h1>Response feedback</h1><p>Ratings and comments from people using Ask DCF.</p></div><Link className="readiness-back" href="/resources">Back to Resources</Link></div>
    <nav className="feedback-nav" aria-label="Resource areas"><Link href="/resources">Resources</Link><span aria-current="page">Feedback</span></nav>
    {total ? <><section className="feedback-summary" aria-label="Rating summary"><div className="feedback-summary-total"><strong>{total}</strong><span>Total responses rated</span></div><div className="feedback-summary-total"><strong>{average!.toFixed(1)} / 5</strong><span>Average rating</span></div><div className="feedback-distribution">{[5, 4, 3, 2, 1].map(value => <div key={value}><span>{value}★</span><div className="feedback-bar" aria-label={`${distribution[value - 1]} ratings, ${Math.round(distribution[value - 1] / total * 100)} percent`}><i style={{ width: `${distribution[value - 1] / total * 100}%` }}/></div><span>{distribution[value - 1]} · {Math.round(distribution[value - 1] / total * 100)}%</span></div>)}</div></section>
      <section className="feedback-review" aria-label="Feedback review"><div className="feedback-review-heading"><h2>Review responses</h2><Link href="/resources/feedback?rating=low">Low-rated responses (1–2★)</Link></div>
        <form className="feedback-filters" action="/resources/feedback" method="get">
          <label>Rating<select name="rating" defaultValue={rating}><option value="">All ratings</option><option value="low">Low-rated (1–2)</option>{[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value} star{value === 1 ? "" : "s"}</option>)}</select></label>
          <label>Personality<select name="personality" defaultValue={personality}><option value="">All people</option>{(people.data || []).map(person => <option key={person.id} value={person.id}>{person.canonical_name}</option>)}</select></label>
          <label>Tag<select name="tag" defaultValue={tag}><option value="">All tags</option>{feedbackTags.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          <label>Date<select name="recent" defaultValue={recent}><option value="">All dates</option><option value="7">Past 7 days</option><option value="30">Past 30 days</option><option value="90">Past 90 days</option></select></label>
          <label>Evidence<select name="search" defaultValue={search}><option value="">All answers</option><option value="live">Live search</option><option value="local">Local evidence</option></select></label>
          <button type="submit">Apply filters</button><Link href="/resources/feedback">Clear</Link>
        </form>
        <p className="feedback-result-count">{filteredCount} matching response{filteredCount === 1 ? "" : "s"}</p>
        {rows.length ? <div className="feedback-list">{rows.map(row => <details className="feedback-entry" key={row.id}><summary><span className="feedback-entry-rating" aria-label={`${row.rating} of 5 stars`}>{"★".repeat(row.rating)}<span>{"☆".repeat(5 - row.rating)}</span></span><span className="feedback-entry-main"><strong>{row.question}</strong><small>{row.personality_name} · {date(row.created_at)} · {row.used_live_search ? "Live search" : "Local evidence"} · {row.citation_count} citation{row.citation_count === 1 ? "" : "s"}</small>{row.comment && <em>{row.comment}</em>}{row.feedback_tags.length > 0 && <span className="feedback-entry-tags">{row.feedback_tags.join(" · ")}</span>}</span></summary><div className="feedback-entry-detail"><h3>Question</h3><p>{row.question}</p><h3>Answer snapshot</h3><div className="feedback-answer-snapshot">{row.answer_snapshot}</div><h3>Sources and citations</h3>{row.citations.length ? <ul>{row.citations.map((citation, index) => <li key={`${citation.id}-${index}`}><strong>[{citation.id}] {citation.title}</strong> · {citation.kind}{citation.pageOrSection && ` · ${citation.pageOrSection}`}{citation.url && <span> · <a href={citation.url} target="_blank" rel="noopener noreferrer">Source link</a></span>}{citation.claimId && <small>Claim ID: {citation.claimId}</small>}{citation.chunkId && <small>Passage ID: {citation.chunkId}</small>}</li>)}</ul> : <p>No citations recorded.</p>}<h3>Feedback</h3><p>{row.rating} / 5 · {row.feedback_tags.join(", ") || "No tags"}</p><p>{row.comment || "No written comment."}</p><p className="feedback-entry-metadata">Response ID: {row.response_id} · Request ID: {row.request_id || "Unavailable"} · Mode: {row.answer_mode} · Provider: {row.provider || "Unavailable"} · Model: {row.model || "Unavailable"}</p></div></details>)}</div> : <p className="feedback-empty">No feedback matches these filters.</p>}
        {pages > 1 && <nav className="feedback-pagination" aria-label="Feedback pages">{page > 1 && <Link href={hrefFor(page - 1)}>Previous</Link>}<span>Page {page} of {pages}</span>{page < pages && <Link href={hrefFor(page + 1)}>Next</Link>}</nav>}
      </section></> : <div className="feedback-empty"><h2>No feedback yet</h2><p>Ratings will appear here after someone submits feedback on an AI answer.</p></div>}
  </main>;
}
