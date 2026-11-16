import type { Metadata } from "next";
import { ExploreLanding } from "./explore-landing";

export const metadata: Metadata = {
  title: "Explore the collection | DCF",
  description: "Search the collection of sourced historical profiles.",
};

export default function ExplorePage({ searchParams }: { searchParams: Promise<{ category?: string | string[] }> }) {
  return <ExploreLanding searchParams={searchParams} />;
}
