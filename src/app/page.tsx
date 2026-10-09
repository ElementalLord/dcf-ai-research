import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function HomePage() {
  return (
    <main className="intro-page page-shell">
      <div className="page-kicker">Introduction</div>
      <section className="intro-hero">
        <p className="section-label">DCF Research</p>
        <h1>Ask about a person.<br /><em>Read the evidence.</em></h1>
        <p className="intro-lede">DCF helps you study people found in historical records and textual traditions. Ask a question, read a sourced answer, and open its citations to see the material behind it.</p>
        <Link href="/ai" className="intro-action">Ask a question <ArrowRight size={17} aria-hidden="true" /></Link>
      </section>
    </main>
  );
}
