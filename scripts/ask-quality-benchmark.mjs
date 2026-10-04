const personalityId = process.argv[2];
const output = process.argv[3];
const base = process.env.ASK_BENCHMARK_URL || "http://localhost:3000";
if (!personalityId || !output) throw new Error("Usage: node scripts/ask-quality-benchmark.mjs <personality-uuid> <output.json>");

const questions = [
  ["profile", "Who is Vishvamitra?"],
  ["profile", "Tell me about Vishvamitra."],
  ["significance", "What is Vishvamitra known for?"],
  ["significance", "Why is Vishvamitra important?"],
  ["textual_contribution", "What are Vishvamitra's biggest contributions?"],
  ["follow_up", "What is the biggest contribution of him?"],
  ["relationship", "What happened between Vishvamitra and Vasistha?"],
  ["narrative", "What was Vishvamitra's role in Rama's story?"],
  ["source_specific", "What is the significance of Rigveda 3.33 for Vishvamitra?"],
  ["transformation", "How did Vishvamitra become a Brahmarishi?"],
  ["texts", "What texts are associated with Vishvamitra?"],
  ["unsupported", "What was Vishvamitra's favorite food?"],
];
const extendedQuestions = [
  ["lineage", "What does the approved evidence say about Vishvamitra's lineage?"],
  ["philosophy", "What philosophical ideas are associated with Vishvamitra?"],
  ["historical_context", "How do Vedic and epic portraits of Vishvamitra differ?"],
  ["contested", "Can Vishvamitra be assigned a certain historical date?"],
  ["contemporary_relevance", "Why is Vishvamitra discussed today?"],
];
if (process.argv.includes("--extended")) questions.push(...extendedQuestions);
const only = process.argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length);
const selectedQuestions = only ? questions.filter((_, index) => only.split(",").includes(String(index + 1))) : questions;

const results = [];
for (const [category, question] of selectedQuestions) {
  const start = Date.now();
  try {
    const response = await fetch(`${base}/api/ask`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personalityId, question }) });
    const result = await response.json();
    const citations = new Set((result.citations || []).map((citation) => citation.id));
    const used = [...(result.answer || "").matchAll(/\[([CS]\d+)\]/g)].map((match) => match[1]);
    const debug = result.debug || {};
    const shouldAbstain = category === "unsupported";
    results.push({ category, question, status: result.status, expectedOutcome: shouldAbstain ? "abstained" : "answered", correctAbstention: shouldAbstain ? result.status === "abstained" : result.status !== "abstained",
      answer: result.answer, wordCount: (result.answer || "").trim().split(/\s+/).filter(Boolean).length, evidence: result.evidence, citations: result.citations,
      scope: debug.questionScope, evidenceCount: debug.finalSelectedEvidenceCount, parameters: debug.parametersRepresented || [], sources: debug.sourcesRepresented || [],
      braveCalls: debug.webSearchCalls || 0, braveQueries: debug.braveQueries || [], geminiCalls: debug.geminiCalls || 0,
      latencyMs: Date.now() - start, answerCacheHit: debug.answerCacheHit || false, coverageStatus: debug.coverageStatus,
      missingEvidenceDimensions: debug.missingEvidenceDimensions || [], citationIdsValid: used.every((id) => citations.has(id)),
      provider: debug.provider, fallbackReason: debug.generationFallbackReason || null, needsHumanQualityReview: true, debug });
    console.log(`${results.length}/${selectedQuestions.length} ${question}: ${result.status}, ${Date.now() - start}ms`);
  } catch (error) {
    results.push({ category, question, error: String(error), latencyMs: Date.now() - start });
    console.error(`${results.length}/${selectedQuestions.length} ${question}: ${String(error)}`);
  }
}
const fs = await import("node:fs/promises");
await fs.writeFile(output, JSON.stringify(results, null, 2));
