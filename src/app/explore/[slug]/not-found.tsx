import Link from "next/link";
export default function PersonNotFound() {
  return <main className="page explore-shell empty-state"><h1>We can’t find this person</h1><p>Check the name, or look at everyone we have.</p><Link className="button" href="/explore">See all people</Link></main>;
}
