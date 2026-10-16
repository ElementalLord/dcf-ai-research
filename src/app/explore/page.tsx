import type { Metadata } from "next";
import { ExploreClient } from "./explore-client";
import { getDiscoveryPeople, getPhase1Dataset } from "@/lib/phase1/dataset";
import { MysticBackdrop } from "@/components/mystic-backdrop";

export const metadata: Metadata = {
  title: "Explore the Phase 1 Collection | DCF",
  description: "Browse, search, and filter 25 sourced profiles across five approved Phase 1 categories.",
};

export default function ExplorePage() {
  const dataset = getPhase1Dataset();
  const categories = dataset.phase1Presentation.categories.map((category) => ({ id: category.id, name: category.name, description: category.description }));
  return (
    <main className="explore-page page-shell">
      <MysticBackdrop />
      <div className="page-kicker">01 / EXPLORE</div>
      <header className="explore-hero">
        <div>
          <p className="section-label">Explore DCF · Phase 1</p>
          <h1>Explore lives,<br /><em>ideas, and contributions.</em></h1>
        </div>
        <div>
          <p>Browse 25 Mentor-approved profiles, organized into five public categories. Search by name or explore the collection through the roles and lenses that best fit each person.</p>
          <dl><div><dt>25</dt><dd>personalities</dd></div><div><dt>5</dt><dd>categories</dd></div></dl>
        </div>
      </header>
      <ExploreClient people={getDiscoveryPeople()} categories={categories} />
    </main>
  );
}
