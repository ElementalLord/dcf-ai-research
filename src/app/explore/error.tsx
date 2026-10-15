"use client";

export default function ExploreError({ reset }: { reset: () => void }) {
  return (
    <main className="explore-error page-shell">
      <p className="section-label">Collection unavailable</p>
      <h1>We could not load the Phase 1 profiles.</h1>
      <p>The approved export may be missing or temporarily unavailable.</p>
      <button type="button" onClick={reset}>Try again</button>
    </main>
  );
}
