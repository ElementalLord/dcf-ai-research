"use client";
export default function ExploreError({ reset }: { reset: () => void }) {
  return <main className="explore-shell explore-state"><h1>Couldn’t load the collection</h1><p>The collection data is unavailable. Try again.</p><button type="button" onClick={reset}>Try again</button></main>;
}
