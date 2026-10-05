import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export default function HomePage() {
  return <main className="intro-page page-shell">
    <div className="intro-meta"><span>DCF / RESEARCH LIBRARY</span><span>01 — INTRODUCTION</span></div>
    <section className="intro-hero"><p className="section-label">A research assistant for lives and traditions</p><h1>Understand the person.<br/><em>Examine the evidence.</em></h1><p className="intro-lede">DCF brings together sourced research about people whose lives appear across texts, traditions, and historical records. Ask a question, read a clear answer, and follow its citations back to the material behind it.</p><Link href="/ai" className="editorial-link">Begin with a question <ArrowUpRight size={17}/></Link></section>
    <section className="intro-method"><div><p className="section-label">How to use DCF</p><h2>Read with context.</h2></div><div className="method-steps"><article><span>01</span><div><h3>Choose a person</h3><p>Explore any personality in the DCF collection. The research follows the person you select.</p></div></article><article><span>02</span><div><h3>Ask and adjust depth</h3><p>Start with a simple question or request a detailed research response. Follow up where the evidence invites a closer look.</p></div></article><article><span>03</span><div><h3>Inspect the sources</h3><p>Citations point to approved claims and source passages. Open them to see the cited excerpt, location, and source context.</p></div></article></div></section>
    <section className="intro-principles"><p className="section-label">A note on evidence</p><div><h2>Different kinds of knowledge deserve different language.</h2><p>A textual tradition tells us what a text or community preserves. Historical evidence asks what can be established about the past. Interpretation explains meaning. DCF keeps those layers distinct and identifies uncertainty when the available material cannot settle a question.</p><p>Its answers are grounded in reviewed material, with citations that let you examine the trail yourself.</p></div></section>
    <footer className="intro-footer"><span>DCF Research</span><Link href="/ai">Explore the AI <ArrowUpRight size={16}/></Link></footer>
  </main>;
}
