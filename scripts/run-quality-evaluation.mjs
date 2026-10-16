import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const datasetPath = path.resolve(process.argv[2] || "data/quality-evaluation-v1.json");
const outputPath = path.resolve(process.argv[3] || "artifacts/quality-sprint/evaluation-results.json");
const baseUrl = process.env.QUALITY_EVAL_URL || "http://localhost:3000";
const limitArg = process.argv.find((argument) => argument.startsWith("--limit="));
const limit = Math.max(1, Number(limitArg?.split("=")[1] || 300));
const offsetArg = process.argv.find((argument) => argument.startsWith("--offset="));
const offset = Math.max(0, Number(offsetArg?.split("=")[1] || 0));
const personalityArg = process.argv.find((argument) => argument.startsWith("--personalities="));
const selectedPersonalities = new Set((personalityArg?.slice("--personalities=".length) || "")
  .split(",").map((value) => value.trim()).filter(Boolean));
const externalSearchCap = Math.max(0, Number(process.env.QUALITY_EVAL_EXTERNAL_SEARCH_CAP || 0));
const modelCallCap = Math.max(0, Number(process.env.QUALITY_EVAL_MODEL_CALL_CAP || 0));
if (externalSearchCap !== 0 || modelCallCap !== 0) throw new Error("This runner defaults to zero external-search and paid-model calls. Use an explicitly configured provider-capped runner for nonzero budgets.");
const dataset = JSON.parse(await readFile(datasetPath, "utf8"));
const eligibleQuestions = selectedPersonalities.size
  ? dataset.questions.filter((item) => selectedPersonalities.has(item.personality) || selectedPersonalities.has(item.personalityId))
  : dataset.questions;
const questions = eligibleQuestions.slice(offset, Math.min(offset + limit, eligibleQuestions.length));
if (selectedPersonalities.size && questions.length === 0) throw new Error("No evaluation questions matched --personalities.");
const results = [];

function citedIds(answer) { return [...String(answer || "").matchAll(/\[([CS]\d+)\]/g)].map((match) => match[1]); }
function outcome(result, expected) {
  if (result.status === "abstained") return "declined";
  if (/not (?:enough|sufficient)|cannot (?:determine|establish)|uncertain|disputed|available evidence/i.test(result.answer || "")) return "qualified";
  return expected === "qualified" ? "answered" : "answered";
}

for (const [index, item] of questions.entries()) {
  const started = Date.now();
  try {
    const response = await fetch(`${baseUrl}/api/ask`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personalityId: item.personalityId, question: item.question, responseStyle: "balanced" }), signal: AbortSignal.timeout(60_000) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || payload?.error || `HTTP ${response.status}`);
    const citations = payload.citations || [];
    const validIds = new Set(citations.map((citation) => citation.id));
    const used = citedIds(payload.answer);
    const citationValid = used.length > 0 && used.every((id) => validIds.has(id));
    const citationSupported = citationValid && citations.filter((citation) => used.includes(citation.id)).every((citation) => Boolean(citation.excerpt?.trim()) && Boolean(citation.claimId || citation.chunkId || citation.sourceId));
    const actualOutcome = outcome(payload, item.expectedOutcome);
    const expectedMatched = item.expectedOutcome === "fully_answered" ? actualOutcome === "answered" : item.expectedOutcome === "declined" ? actualOutcome === "declined" : actualOutcome === "qualified";
    const retrievalSufficient = item.expectedOutcome === "declined" ? payload.status === "abstained" || citations.length === 0 : citations.length > 0;
    const failureReasons = [];
    if (!expectedMatched) failureReasons.push(item.expectedOutcome === "declined" ? "unjustified_confidence" : "excessive_uncertainty");
    if (!citationValid && payload.status !== "abstained") failureReasons.push("citation_mismatch");
    if (!citationSupported && payload.status !== "abstained") failureReasons.push("citation_support_unverified");
    if (!retrievalSufficient) failureReasons.push("retrieval_failure_or_missing_corpus_coverage");
    results.push({ questionId: item.id, personalityId: item.personalityId, personality: item.personality, testedSkill: item.testedSkill,
      expectedOutcome: item.expectedOutcome, outcome: actualOutcome, status: payload.status, passed: expectedMatched && (payload.status === "abstained" || citationValid && citationSupported),
      citationValid, citationSupported, retrievalSufficient, factualAccuracy: "needs_human_review", failureReasons,
      latencyMs: Date.now() - started, externalSearchCalls: 0, modelCalls: 0, answer: payload.answer, citations });
  } catch (error) {
    results.push({ questionId: item.id, personalityId: item.personalityId, personality: item.personality, testedSkill: item.testedSkill,
      expectedOutcome: item.expectedOutcome, outcome: "error", passed: false, citationValid: false, citationSupported: false,
      retrievalSufficient: false, factualAccuracy: "not_model_graded", failureReasons: ["timeout_or_technical_error"], latencyMs: Date.now() - started, error: String(error) });
  }
  console.log(`${index + 1}/${questions.length} ${item.personality}: ${results.at(-1).outcome}`);
}

const byPersonality = Object.values(Object.groupBy(results, (result) => result.personality)).map((entries) => ({ personality: entries[0].personality,
  questions: entries.length, passed: entries.filter((entry) => entry.passed).length, citationValid: entries.filter((entry) => entry.citationValid).length,
  citationSupported: entries.filter((entry) => entry.citationSupported).length, retrievalSucceeded: entries.filter((entry) => entry.retrievalSufficient).length,
  averageLatencyMs: Math.round(entries.reduce((sum, entry) => sum + entry.latencyMs, 0) / entries.length) }));
const report = { suiteVersion: dataset.suiteVersion, runAt: new Date().toISOString(), mode: "local_pipeline", configuration: { baseUrl, limit: questions.length, offset,
  personalities: [...selectedPersonalities], externalSearchCap, modelCallCap, factualAccuracy: "requires human review" }, summary: { questions: results.length, passed: results.filter((result) => result.passed).length,
  citationValid: results.filter((result) => result.citationValid).length, citationSupported: results.filter((result) => result.citationSupported).length,
  retrievalSucceeded: results.filter((result) => result.retrievalSufficient).length, errors: results.filter((result) => result.outcome === "error").length }, byPersonality, results };
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary));
