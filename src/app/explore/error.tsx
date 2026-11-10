"use client";
export default function ExploreError({ reset }: { reset: () => void }) {
  return <main className="page explore-shell empty-state"><h1>Something went wrong</h1><p>We could not load the people. Please try again.</p><button type="button" className="button" onClick={reset}>Try again</button></main>;
}
