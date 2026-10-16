"use client";

import { Button } from "@/components/ui/button";
import { MysticBackdrop } from "@/components/mystic-backdrop";
import { ExploreConstellation } from "./explore-constellation";

export default function ExploreError({ reset }: { reset: () => void }) {
  return (
    <main className="explore-error page-shell">
      <MysticBackdrop />
      <ExploreConstellation />
      <section>
        <p className="section-label">Collection unavailable</p>
        <h1>We could not load the Phase 1 profiles.</h1>
        <p>The approved export may be missing or temporarily unavailable.</p>
        <Button type="button" onClick={reset}>Try again</Button>
      </section>
    </main>
  );
}
