// Run against a server launched with SYNTHESIS_DISABLED=true EMBEDDINGS_DISABLED=true.
// Optional: RESILIENCE_EXPECT_PROVIDER=gemini checks generated answer + repeat cache.
import assert from "node:assert/strict";
const base = process.env.CORPUS_API_BASE || "http://127.0.0.1:3000";
const options = await fetch(`${base}/api/research/options`).then((response) => response.json());
const personality = options.personalities?.find((item) => item.canonical_name === "Vishvamitra");
assert(personality, "Vishvamitra must exist in the selected corpus");
const questions = ["Who is Vishvamitra?", "What role did Vishvamitra play in Rama's story?", "What was Vishvamitra's favorite food?", "who is vishvamitra"];
const results = [];
for (const question of questions) {
  const started = performance.now();
  const response = await fetch(`${base}/api/ask`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personalityId: personality.id, question }) });
  assert(response.ok, `Ask failed: ${response.status}`);
  const result = await response.json();
  assert(result.debug.generativeCalls <= 1, "Interactive generation budget exceeded");
  if (question.includes("favorite food")) {
    assert.equal(result.status, "abstained");
    assert.equal(result.debug.generativeCalls, 0);
  } else {
    assert.notEqual(result.status, "abstained");
    const valid = new Set(result.citations.map((citation) => citation.id));
    const cited = [...result.answer.matchAll(/\[([CS]\d+)\]/g)];
    assert(cited.length > 0 && cited.every((match) => valid.has(match[1])), "Citation integrity failed");
    if (process.env.RESILIENCE_EXPECT_PROVIDER !== "gemini") {
      assert.equal(result.debug.generativeCalls, 0);
      assert.equal(result.debug.embeddingCalls, 0);
    }
  }
  results.push({ question, status: result.status, ms: Math.round(performance.now() - started), citations: result.citations.length, generativeCalls: result.debug.generativeCalls, embeddingCalls: result.debug.embeddingCalls, answerCacheHit: result.debug.answerCacheHit, errorCategory: result.debug.synthesisErrorCategory });
}
console.log(JSON.stringify(results, null, 2));
if (process.env.RESILIENCE_EXPECT_PROVIDER === "gemini") {
  assert.equal(results[0].status, "complete", "Live provider synthesis was unavailable; inspect errorCategory");
  assert.equal(results[3].answerCacheHit, true, "Repeated question must reuse generated answer");
  assert.equal(results[3].generativeCalls, 0);
}
