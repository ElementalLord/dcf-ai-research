import { buildBoundedContext } from "./context";
import { GeminiSynthesisProvider, ExtractiveSynthesisProvider, validateAnswerCitations } from "./synthesis-provider";
import { answerCacheIdentity, readAnswerCache, writeAnswerCache } from "./answer-cache";
import { incrementMetric, withRequestUsage, usageMetrics } from "./usage";
import { canonicalizeQuestion } from "./personality-config";
import { logStage, stageTimer } from "./observability";
import { retrieveWithApprovedResearch } from "@/lib/live-research/research";
import { citationsMatchEvidence, mergePersonalityEvidence } from "./comparison";
import { loadPersonalityConfiguration } from "./personality-context";
import { normalizedAliases } from "./personality-config";
import { resolveQuestionContext, type ConversationQuestion } from "@/lib/ask/query-context";
import { abstentionMessage } from "@/lib/ask/messages";

const ABSTENTION = "The approved knowledge base does not currently contain enough evidence to answer that fully.";

async function answerQuestionInternal(
  question: string,
  personalityId: string | string[],
  options: { history?: ConversationQuestion[] } = {},
) {
  const personalityIds = [...new Set(Array.isArray(personalityId) ? personalityId : [personalityId])];
  const configurations = await Promise.all(personalityIds.map(loadPersonalityConfiguration));
  const queryContext = resolveQuestionContext(
    canonicalizeQuestion(question, configurations.flatMap((configuration) => [
      ...configuration.termAliases,
      ...configuration.aliases.filter((alias) => !alias.isAmbiguous).map((alias) => ({ alias: alias.alias, canonicalTerm: configuration.canonicalName })),
    ])),
    configurations.map((configuration) => configuration.canonicalName),
    options.history,
  );
  const comparisonAliases = personalityIds.length > 1
    ? configurations.flatMap((configuration) => normalizedAliases(configuration.canonicalName, configuration.aliases))
    : [];
  const retrievals = await Promise.all(personalityIds.map((id, index) => retrieveWithApprovedResearch(queryContext.resolvedQuestion, id, { additionalPersonalityAliases: comparisonAliases, configuration: configurations[index] })));
  const comparisonMode = retrievals.length > 1;
  const personality = retrievals.map((retrieval) => retrieval.personality).join(" and ");
  const parameters = [...new Map(retrievals.flatMap((retrieval) => retrieval.parameters).map((parameter) => [parameter.code, parameter])).values()];
  const provider = new GeminiSynthesisProvider();
  const health = provider.health();
  const debug = {
    providerConfigured: health.configured,
    providerHealthy: health.healthy,
    providerCircuitOpen: health.circuit.open,
    synthesisErrorCategory: health.circuit.open ? health.circuit.category : null,
    generativeCalls: 0,
    embeddingCalls: 0,
    answerCacheHit: false,
    answerCacheKey: null as string | null,
    extractiveFallbackUsed: false,
    fallbackUsed: false,
    provider: "none",
    model: null as string | null,
    synthesisLatencyMs: 0,
    estimatedEvidenceTokens: 0,
    ...retrievals[0].debug,
    comparisonMode,
    latenciesMs: { ...retrievals[0].debug.latenciesMs },
    liveFetches: retrievals.reduce((sum, item) => sum + item.debug.liveFetches, 0),
    cacheHits: retrievals.reduce((sum, item) => sum + item.debug.cacheHits, 0),
    liveResearchTriggered: retrievals.some((item) => item.debug.liveResearchTriggered),
    selectedPersonalities: retrievals.map((retrieval) => ({ id: retrieval.personalityId, name: retrieval.personality })),
    perPersonality: retrievals.map((retrieval) => ({ personality: retrieval.personality, debug: retrieval.debug })),
  };
  if (retrievals.some((retrieval) => !retrieval.debug.localEvidenceSufficient)) {
    return {
      personality,
      question,
      resolvedQuestion: queryContext.resolvedQuestion,
      queryContext,
      structuredContext: { active_personality_ids: personalityIds, recent_named_entities: queryContext.subjects, recent_topic: queryContext.resolvedQuestion.slice(0, 200), recent_parameters: parameters.map((parameter) => parameter.code) },
      status: "abstained" as const,
      answer: abstentionMessage(personality),
      retrievedParameters: parameters,
      citations: [],
      evidence: [],
      conflicts: [],
      debug,
    };
  }
  const evidence = comparisonMode
    ? mergePersonalityEvidence(retrievals.map((retrieval) => ({ personalityId: retrieval.personalityId, personalityName: retrieval.personality, evidence: retrieval.evidence })))
    : retrievals[0].evidence;
  const bounded = buildBoundedContext(evidence);
  debug.finalSelectedEvidenceCount = bounded.selected.length;
  if (!bounded.context) {
    return {
      personality,
      question,
      resolvedQuestion: queryContext.resolvedQuestion,
      queryContext,
      structuredContext: { active_personality_ids: personalityIds, recent_named_entities: queryContext.subjects, recent_topic: queryContext.resolvedQuestion.slice(0, 200), recent_parameters: parameters.map((parameter) => parameter.code) },
      status: "abstained" as const,
      answer: abstentionMessage(personality),
      retrievedParameters: parameters,
      citations: [],
      evidence: [],
      conflicts: [],
      debug,
    };
  }
  if (!citationsMatchEvidence(bounded.citations, bounded.selected)) {
    throw new Error("Citation integrity validation failed before answer generation.");
  }

  const identity = answerCacheIdentity(personalityIds, queryContext.resolvedQuestion, debug.evidencePolicyMode || "test", bounded.selected, bounded.citations);
  debug.answerCacheKey = identity.key;
  debug.estimatedEvidenceTokens = Math.ceil(bounded.context.length / 4);
  const stopCache = stageTimer("ANSWER_CACHE");
  const cached = await readAnswerCache(identity.key, bounded.citations);
  debug.latenciesMs.answerCache = stopCache();
  debug.answerCacheHit = Boolean(cached);
  if (cached) incrementMetric("answerCacheHits");
  const stopGeneration = stageTimer("GENERATION");
  let generated: { text: string; interactionId: string | null };
  let usedLocalSynthesis = false;
  const extractive = new ExtractiveSynthesisProvider();
  const fallback = () => extractive.generateGroundedAnswer({ prompt: "", evidence: bounded.selected, citations: bounded.citations, broad: queryContext.broadSynthesis });
  if (cached) {
    generated = { text: cached.answer, interactionId: null };
    debug.provider = cached.provider;
    debug.model = cached.model;
  } else if (!health.healthy) {
    usedLocalSynthesis = true;
    debug.generationFallbackReason = "AI synthesis unavailable; showing verified evidence.";
    generated = await fallback();
  } else {
    const prompt = `You are the DCF Inspiring Personalities AI.
Answer using ONLY the retrieved evidence below. Do not use pretrained knowledge as evidence.

PERSONALITY OR INTENTIONAL COMPARISON SET: ${personality}
QUESTION: ${question}
RESOLVED QUESTION FOR REFERENCE: ${queryContext.resolvedQuestion}

EVIDENCE:
${bounded.context}

Rules:
1. Every important factual statement needs one or more exact evidence citations such as [C1] or [S1].
2. Never invent a citation or a fact.
3. APPROVED CLAIM and DIRECT PASSAGE FROM AN APPROVED SOURCE are different trust classes; preserve approval origin and evidence type.
4. Label primary text, epic/traditional narrative, scholarly interpretation, modern spiritual interpretation, and uncertain or contested material accurately.
5. Never present an epic or other traditional narrative passage as independently verified modern history.
6. Do not silently resolve conflicts between traditions or textual layers.
7. If the evidence only permits an inference, say that the passage suggests or portrays it.
8. If the evidence does not answer the question, respond exactly: "${ABSTENTION}"
9. Prefer a direct, concise answer before explanation.
10. For subjective or superlative wording, do not present a ranking as objectively proven. State the criterion and use language such as "one of the most significant" unless the evidence explicitly establishes a ranking.
11. For broad synthesis questions, weigh relevant evidence across roles, texts, ideas, historical or textual significance, and narrative traditions when those dimensions are present.
12. Use short paragraphs and occasional descriptive headings or bullets when they improve readability.`;
    try {
      incrementMetric("synthesisAttempted");
      generated = await provider.generateGroundedAnswer({ prompt, evidence: bounded.selected, citations: bounded.citations, broad: queryContext.broadSynthesis });
      if (generated.text !== ABSTENTION && !validateAnswerCitations(generated.text, bounded.citations)) throw new Error("Invalid synthesis citations");
      incrementMetric("synthesisSucceeded");
      debug.provider = provider.name;
      debug.model = provider.model;
      debug.generationFallbackReason = null;
    } catch (error) {
      usedLocalSynthesis = true;
      debug.synthesisErrorCategory = provider.classifyError(error);
      incrementMetric(`synthesis_${debug.synthesisErrorCategory}`);
      debug.generationFallbackReason = "AI synthesis temporarily unavailable; showing verified evidence.";
      generated = await fallback();
    }
  }
  debug.latenciesMs.generation = stopGeneration();
  logStage("FINAL_CONTEXT", { records: bounded.selected.length, characters: bounded.context.length });
  logStage("GENERATION", { ms: debug.latenciesMs.generation });
  debug.synthesisLatencyMs = debug.latenciesMs.generation;
  debug.providerCircuitOpen = provider.health().circuit.open;
  debug.providerHealthy = provider.health().healthy;
  if (usedLocalSynthesis) {
    debug.provider = extractive.name;
    debug.model = null;
    debug.extractiveFallbackUsed = true;
    debug.fallbackUsed = true;
    incrementMetric("extractiveFallbacks");
  }
  const cleanedAnswer = generated.text.trim();
  if (!cached && !usedLocalSynthesis && cleanedAnswer !== ABSTENTION) {
    await writeAnswerCache(identity, personalityIds, debug.evidencePolicyMode || "test", { answer: cleanedAnswer, provider: debug.provider, model: debug.model });
  }
  const abstained = cleanedAnswer === ABSTENTION;
  const answer = abstained ? abstentionMessage(personality) : cleanedAnswer;
  const layers = [...new Set(bounded.selected.map((item) => item.textualLayer).filter(Boolean))];
  const conflicts = layers.length > 1
    ? [{ type: "TEXTUAL_LAYER_VARIANT", message: "Evidence from multiple textual layers was retrieved; the answer should preserve their distinctions.", layers }]
    : [];

  return {
    personality,
    question,
    resolvedQuestion: queryContext.resolvedQuestion,
    queryContext,
    structuredContext: { active_personality_ids: personalityIds, recent_named_entities: queryContext.subjects, recent_topic: queryContext.resolvedQuestion.slice(0, 200), recent_parameters: parameters.map((parameter) => parameter.code) },
    status: abstained ? "abstained" as const : usedLocalSynthesis ? "extractive_fallback" as const : "complete" as const,
    answer,
    retrievedParameters: parameters,
    citations: bounded.citations,
    evidence: bounded.selected.map((item, index) => ({ citationId: bounded.citations[index]?.id, ...item })),
    conflicts,
    debug,
    interactionId: generated.interactionId,
  };
}

export async function answerQuestion(question: string, personalityId: string | string[], options: { history?: ConversationQuestion[] } = {}) {
  incrementMetric("totalAskRequests");
  return withRequestUsage(async (usage) => {
    const started = performance.now();
    const result = await answerQuestionInternal(question, personalityId, options);
    result.debug.generativeCalls = usage.generativeCalls;
    result.debug.embeddingCalls = usage.embeddingCalls;
    result.debug.latenciesMs.total = Math.round(performance.now() - started);
    if (result.debug.liveResearchTriggered) incrementMetric("liveResearchTriggers");
    if (result.debug.semanticFallbackReason && result.debug.semanticFallbackReason !== "semantic_skipped_sufficient_lexical_claim_candidates") incrementMetric("semanticFallbacks");
    return { ...result, debug: { ...result.debug, usageMetrics: usageMetrics() } };
  });
}
