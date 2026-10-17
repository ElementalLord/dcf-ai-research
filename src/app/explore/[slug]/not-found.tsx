import Link from "next/link";
export default function PersonNotFound() {
  return <main className="explore-shell explore-state"><h1>This person isn’t in the collection</h1><p>Check the name or browse the people we have.</p><Link href="/explore">Back to Explore</Link></main>;
}
