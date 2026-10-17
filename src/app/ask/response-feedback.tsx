"use client";

import { useEffect, useRef, useState } from "react";
import { feedbackTags, type FeedbackContext, type FeedbackTag } from "@/lib/feedback";

const labels = ["Poor", "Fair", "Good", "Very good", "Excellent"];

export default function ResponseFeedback({ token, legacyContext }: { token?: string; legacyContext?: FeedbackContext }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [tags, setTags] = useState<FeedbackTag[]>([]);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);
  const storageKey = `dcf-feedback:${token ? token.slice(-43) : legacyContext?.responseId}`;
  useEffect(() => {
    try { if (window.sessionStorage.getItem(storageKey)) queueMicrotask(() => setSubmitted(true)); }
    catch { /* The database still rejects duplicate responses. */ }
  }, [storageKey]);
  if (submitted) return <p className="response-feedback-success" role="status">Feedback submitted</p>;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!rating || locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(token ? { token } : { legacyContext }), rating, comment, tags }) });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (response.status === 409) { setSubmitted(true); return; }
        throw new Error(data.error || "Feedback could not be saved. Try again.");
      }
      try { window.sessionStorage.setItem(storageKey, "submitted"); } catch { /* Session storage is optional. */ }
      setSubmitted(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Feedback could not be saved. Try again.");
    } finally { locked.current = false; setBusy(false); }
  }

  return <form className="response-feedback" onSubmit={submit}>
    <fieldset disabled={busy}><legend>How would you rate this response?</legend>
      <div className="response-feedback-stars" role="radiogroup" aria-label="Response rating">{labels.map((label, index) => <label key={label} title={`${index + 1} — ${label}`}><input type="radio" name="rating" value={index + 1} checked={rating === index + 1} onChange={() => setRating(index + 1)} aria-label={`${index + 1} star${index ? "s" : ""} — ${label}`}/><span aria-hidden="true">★</span></label>)}</div>
      {rating > 0 && <div className="response-feedback-details"><p className="response-feedback-choice">{rating} / 5 · {labels[rating - 1]}</p><label className="response-feedback-comment">Tell us what was helpful or what could be improved.<textarea value={comment} onChange={event => setComment(event.target.value)} maxLength={2000} rows={3} placeholder="Optional feedback"/></label>
        <div className="response-feedback-tags" role="group" aria-label="Quick feedback tags">{feedbackTags.map(tag => <label key={tag}><input type="checkbox" checked={tags.includes(tag)} onChange={() => setTags(current => current.includes(tag) ? current.filter(item => item !== tag) : [...current, tag])}/><span>{tag}</span></label>)}</div>
      </div>}
      <button className="response-feedback-submit" type="submit" disabled={busy || !rating}>{busy ? "Submitting…" : "Submit feedback"}</button>
    </fieldset>
    {error && <p className="response-feedback-error" role="alert">{error}</p>}
  </form>;
}
