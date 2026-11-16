import type { Metadata } from "next";
import { ExploreLanding } from "./explore/explore-landing";
import "./explore/explore.css";

export const metadata: Metadata = {
  title: "DCF Inspiring Personalities",
  description: "Explore 25 evidence-grounded profiles across the approved DCF Phase 1 collection.",
};

// The collection is the front page; /explore shows the same page.
export default function HomePage({ searchParams }: { searchParams: Promise<{ category?: string | string[] }> }) {
  return <ExploreLanding searchParams={searchParams} />;
}
