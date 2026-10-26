"use client";

import Link from "next/link";

export default function ResourcesError({ reset }: { reset: () => void }) {
  return <main className="resources-page resource-state page-shell" role="alert">
    <h1>Resources could not be loaded</h1>
    <p>The current records are unavailable. Try loading the page again.</p>
    <div><button type="button" onClick={reset}>Try again</button><Link href="/">Go home</Link></div>
  </main>;
}
