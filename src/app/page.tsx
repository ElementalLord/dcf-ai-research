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
      <section className="intro-guide" aria-label="How DCF works">
        <div><h2>What can I ask?</h2><p>Ask about a person&apos;s life, relationships, texts, or how accounts differ. Choose a person in AI to get started.</p></div>
        <div><h2>How are sources used?</h2><p>Answers cite reviewed library material and, when needed, live research. DCF separates what a text says from what can be established historically.</p></div>
        <div><h2>Can I check an answer?</h2><p>Open any citation to read its supporting passage, source details, and location. Researchers can inspect the full collection in Resources.</p></div>
      </section>
    </main>
  );
}
