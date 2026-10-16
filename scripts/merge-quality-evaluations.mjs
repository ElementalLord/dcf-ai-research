import { readFile, writeFile } from "node:fs/promises";

const output = process.argv[2];
const inputs = process.argv.slice(3);
if (!output || !inputs.length) throw new Error("Usage: node scripts/merge-quality-evaluations.mjs <output> <input...>");
const reports = await Promise.all(inputs.map(async (file) => JSON.parse(await readFile(file, "utf8"))));
const dataset = JSON.parse(await readFile("data/quality-evaluation-v1.json", "utf8"));
const questionById = new Map(dataset.questions.map((question) => [question.id, question]));
const results = reports.flatMap((report) => report.results).map((result) => {
  const expectedMatched = result.expectedOutcome === "fully_answered" ? result.outcome === "answered"
    : result.expectedOutcome === "declined" ? result.outcome === "declined" : result.outcome === "qualified";
  const passed = expectedMatched && (result.outcome === "declined" || result.citationValid && result.citationSupported);
  const question = questionById.get(result.questionId);
  const existingReasons = (result.failureReasons || []).filter((reason) => reason !== "excessive_uncertainty" && reason !== "retrieval_failure_or_missing_corpus_coverage");
  if ((result.failureReasons || []).includes("retrieval_failure_or_missing_corpus_coverage")) {
    existingReasons.push(question?.relevantSourceIds?.length || question?.relevantPassageIds?.length ? "retrieval_failure" : "missing_corpus_coverage");
  }
  const failureReasons = [...new Set([...existingReasons, ...(!expectedMatched ? [result.expectedOutcome === "declined" ? "unjustified_confidence" : "excessive_uncertainty"] : [])])];
  return { ...result, passed, failureReasons };
}).sort((left, right) => left.questionId.localeCompare(right.questionId));
const grouped = Object.values(Object.groupBy(results, (result) => result.personality));
const byPersonality = grouped.map((entries) => ({ personality: entries[0].personality, questions: entries.length,
  passed: entries.filter((entry) => entry.passed).length, citationValid: entries.filter((entry) => entry.citationValid).length,
  citationSupported: entries.filter((entry) => entry.citationSupported).length, retrievalSucceeded: entries.filter((entry) => entry.retrievalSufficient).length,
  averageLatencyMs: Math.round(entries.reduce((sum, entry) => sum + entry.latencyMs, 0) / entries.length) }));
const report = { ...reports[0], runAt: new Date().toISOString(), configuration: { ...reports[0].configuration, limit: results.length, offset: 0, shards: inputs.length },
  summary: { questions: results.length, passed: results.filter((result) => result.passed).length, citationValid: results.filter((result) => result.citationValid).length,
    citationSupported: results.filter((result) => result.citationSupported).length, retrievalSucceeded: results.filter((result) => result.retrievalSufficient).length,
    errors: results.filter((result) => result.outcome === "error").length }, byPersonality, results };
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary));
