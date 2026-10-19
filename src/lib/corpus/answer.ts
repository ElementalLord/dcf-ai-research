import { buildBoundedContext } from "./context";
import { epistemicSafeguard } from "@/lib/claim-epistemics/language";
import { GeminiSynthesisProvider, ExtractiveSynthesisProvider, validateAnswerCitations } from "./synthesis-provider";
import { answerCacheIdentity, readAnswerCache, writeAnswerCache } from "./answer-cache";
import { incrementMetric, withRequestUsage, usageMetrics } from "./usage";
import { canonicalizeQuestion } from "./personality-config";
import { logStage, stageTimer } from "./observability";
import { retrieveWithApprovedResearch } from "@/lib/live-research/research";
import { retrieveEvidence } from "./retrieval";
import { searchWithGoogleGrounding } from "@/lib/live-research/google-grounding";
import { assessEvidenceSufficiency } from "@/lib/live-research/sufficiency";
import { citationsMatchEvidence, mergePersonalityEvidence } from "./comparison";
import { loadPersonalityConfiguration } from "./personality-context";
import { normalizedAliases } from "./personality-config";
import { resolveQuestionContext, type ConversationQuestion } from "@/lib/ask/query-context";
import { abstentionMessage } from "@/lib/ask/messages";
import { ensureOpeningIntro } from "@/lib/ask/opening-intro";
import { buildSynthesisPrompt, SYNTHESIS_PROMPT_VERSION } from "./synthesis-prompt";
import { isBroadScope } from "@/lib/ask/question-scope";
import { answerIntent, hasBroadAnswerEvidence, hasDirectLiveIdentity, prioritizeEvidence } from "@/lib/ask/evidence-priority";
import { loadSearchPolicy } from "@/lib/live-research/search-policy";
import { detectLens } from "@/lib/ask/lenses";
import { chronologyGuidance, CONTEXT_SEARCH_FOCUS, detectContextIntent } from "@/lib/ask/historical-context";
import { classifySourceAuthority } from "@/lib/sources/authority";
import { fillsEvidenceGaps, resolveQuestion } from "@/lib/ask/question-resolution";
import { executeDemandResearch } from "@/lib/live-research/on-demand-engine";
import { productionResearchDependencies } from "@/lib/live-research/on-demand-adapter";
import type { RetrievedEvidence } from "./types";

const ABSTENTION = "The available sources do not contain enough evidence to answer that fully.";
const NO_EVIDENCE_REPLY = /sources (?:currently available )?do not (?:provide|contain) (?:reliable|enough) evidence|don't have enough evidence/i;

async function answerQuestionInternal(
  question: string,
  personalityId: string | string[],
  options: { history?: ConversationQuestion[]; responseStyle?: "simple" | "balanced" | "detailed" | "research" } = {},
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
  const searchPolicyPromise = loadSearchPolicy();
  // A named angle or a request for historical placement steers retrieval, the one live search, and synthesis.
  const lens = detectLens(queryContext.resolvedQuestion);
  const contextIntent = detectContextIntent(queryContext.resolvedQuestion);
  const retrievalQuestion = lens ? `${queryContext.resolvedQuestion} ${lens.retrievalTerms.join(" ")}` : queryContext.resolvedQuestion;
  const searchEmphasis = [lens ? `Emphasize the ${lens.label.toLowerCase()} dimension: ${lens.focus}.` : "", contextIntent ? CONTEXT_SEARCH_FOCUS[contextIntent] : ""].filter(Boolean).join(" ");
  const categorySlugs = configurations.map((configuration) => configuration.categorySlug);
  const withAuthority = (items: RetrievedEvidence[], rules: Awaited<typeof searchPolicyPromise>["rules"]) => {
    for (const item of items) item.authority ||= classifySourceAuthority({ url: item.sourceUrl, sourceType: item.sourceType, institution: item.sourceInstitution,
      live: item.kind === "passage" && (item.origin === "google_grounding" || item.origin === "brave_live") }, rules);
  };
  // Retrieve local evidence first so the single Google step can target its gaps.
  // Brave's original-source workflow runs only if grounding cannot cover them.
  const demandBudget = { remaining: 1 };
  const retrievals = await Promise.all(personalityIds.map(async (id, index) => {
    const retrievalOptions = { additionalPersonalityAliases: comparisonAliases, configuration: configurations[index] };
    const [local, searchPolicy] = await Promise.all([retrieveEvidence(retrievalQuestion, id, retrievalOptions), searchPolicyPromise]);
    const localEvidenceCount = local.evidence.length;
    const resolution = resolveQuestion({ question: queryContext.resolvedQuestion, personalityId: id,
      personalityName: configurations[index].canonicalName, personalityAliases: local.personalityAliases,
      termAliases: local.termAliases, allParameters: local.allParameters, evidence: local.evidence,
      policyMode: local.debug.evidencePolicyMode || "test", researchAvailable: true,
      retrievalErrors: [local.debug.lexicalError, local.debug.claimRetrievalError].filter((error): error is string => Boolean(error)) });
    // The resolver is the factual-use gate; excluded records must not reach synthesis.
    local.evidence = [...resolution.verifiedClaims, ...resolution.verifiedPassages];
    local.debug.questionResolutionState = resolution.state;
    local.debug.questionNeedId = resolution.needId;
    local.debug.missingEvidenceDimensions = resolution.gaps.map((gap) => gap.requirement);
    local.debug.localEvidenceSufficient = resolution.sufficient;
    local.debug.localEvidenceSufficiencyReason = resolution.reason;
    local.debug.answerable = resolution.route === "answer" || resolution.route === "partial_answer";
    local.debug.coverageStatus = resolution.sufficient ? "sufficient" : resolution.route === "partial_answer" ? "partial" : "unsupported";
    if (process.env.DEMAND_RESEARCH_ENABLED === "true") {
      const allocated = resolution.researchRequest ? Math.min(resolution.researchRequest.maxExternalSearches, demandBudget.remaining) : 0;
      demandBudget.remaining -= allocated;
      const research = resolution.researchRequest
        ? await executeDemandResearch({ ...resolution.researchRequest, maxExternalSearches: allocated }, queryContext.resolvedQuestion, local.evidence,
          local.personalityAliases, productionResearchDependencies()) : null;
      if (research) {
        local.evidence.push(...research.passages);
        local.debug.demandResearchStatus = research.status;
        local.debug.demandResearchRequestId = research.requestId;
        local.debug.liveResearchTriggered = research.attempted;
        local.debug.webSearchCalls = research.usage.searchCalls;
        local.debug.liveFetches = research.usage.sourceFetches;
        local.debug.liveSourcesUsed = research.passages.length;
        local.debug.missingEvidenceDimensions = research.unresolvedGaps.map((gap) => gap.requirement);
        local.debug.unresolvedEvidenceGap = research.unresolvedGaps.length > 0;
        local.debug.answerable = resolution.state === "partial_local" || research.citeableNow;
        local.debug.coverageStatus = research.status === "complete" ? "sufficient" : local.debug.answerable ? "partial" : "unsupported";
        local.debug.localEvidenceSufficiencyReason = research.status === "complete" ? "The original source supplies the missing evidence for this response; it remains unadmitted." :
          "The bounded research request did not establish every missing requirement.";
      }
      local.debug.localEvidenceBeforeSearch = localEvidenceCount;
      local.debug.localSourcesUsed = local.evidence.filter((item) => item.kind === "claim" || item.origin !== "brave_live").length;
      withAuthority(local.evidence, searchPolicy.rules);
      return local;
    }
    const googleGaps = resolution.gaps.map((gap) => gap.requirement);
    const google = !resolution.researchJustified
      ? { evidence: [], requests: 0, queries: 0, latencyMs: 0, errorCategory: null }
      : await searchWithGoogleGrounding(queryContext.resolvedQuestion, id, configurations[index].canonicalName,
        options.responseStyle === "research" ? "research" : "normal", searchPolicy, googleGaps, local.personalityAliases, searchEmphasis);
    if (google.evidence.length) local.evidence.push(...google.evidence);
    const groundedDecision = assessEvidenceSufficiency(queryContext.resolvedQuestion, local.evidence, { personalityAliases: local.personalityAliases, termAliases: local.termAliases, allParameters: local.allParameters });
    const googleUseful = google.evidence.length > 0 && groundedDecision.sufficient && fillsEvidenceGaps(resolution.gaps, local.evidence);
    const shouldTryBrave = resolution.researchJustified && !googleUseful;
    const base = shouldTryBrave ? await retrieveWithApprovedResearch(queryContext.resolvedQuestion, id, {
      ...retrievalOptions, initialRetrieval: local, searchPolicy, forceLiveFallback: true,
      evidenceGaps: resolution.gaps.map((gap) => gap.requirement),
    }) : local;
    base.debug.localEvidenceBeforeSearch = localEvidenceCount;
    base.debug.googleGroundedSourcesReturned = new Set(google.evidence.map((item) => item.sourceUrl)).size;
    base.debug.googleSearchRequests = google.requests;
    base.debug.googleSearchQueries = google.queries;
    base.debug.googleSearchLatencyMs = google.latencyMs;
    base.debug.googleSearchErrorCategory = google.errorCategory;
    base.debug.localEvidenceSufficient = resolution.sufficient;
    if (googleUseful) {
      base.debug.answerable = true;
      base.debug.liveResearchTriggered = true;
    } else {
      base.debug.answerable = Boolean(base.debug.answerable || resolution.route === "answer" || resolution.route === "partial_answer");
    }
    base.debug.liveSourcesUsed = base.evidence.filter((item) => item.kind === "passage" && (item.origin === "google_grounding" || item.origin === "brave_live")).length;
    if (resolution.state !== "unsupported" && !base.debug.answerable && hasDirectLiveIdentity(queryContext.resolvedQuestion, base.evidence)) {
      base.debug.answerable = true;
      base.debug.coverageStatus = "partial";
    }
    if (resolution.state !== "unsupported" && !base.debug.answerable && hasBroadAnswerEvidence(queryContext.resolvedQuestion, base.evidence)) {
      base.debug.answerable = true;
      base.debug.coverageStatus = "partial";
      base.debug.unresolvedEvidenceGap = true;
      base.debug.localEvidenceSufficiencyReason = "Multiple grounded records support a qualified broad answer, but not every requested dimension or ranking.";
    }
    if (resolution.state === "research_required" && !fillsEvidenceGaps(resolution.gaps, base.evidence)) {
      base.debug.answerable = false;
      base.debug.unresolvedEvidenceGap = true;
    }
    base.debug.localSourcesUsed = base.evidence.filter((item) => item.kind === "claim" || (item.origin !== "google_grounding" && item.origin !== "brave_live")).length;
    withAuthority(base.evidence, searchPolicy.rules);
    return base;
  }));
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
    epistemicSafeguardNotes: [] as string[],
    fallbackUsed: false,
    provider: "none",
    synthesisMode: "none",
    model: null as string | null,
    synthesisLatencyMs: 0,
    estimatedEvidenceTokens: 0,
    evidenceRetrievedCount: 0,
    evidenceUsedCount: 0,
    answerIntent: "specific" as string,
    ...retrievals[0].debug,
    questionScope: queryContext.scope,
    lens: lens?.id || null,
    contextIntent,
    synthesisPromptVersion: SYNTHESIS_PROMPT_VERSION,
    synthesisModel: health.configured ? provider.model : null,
    comparisonMode,
    latenciesMs: { ...retrievals[0].debug.latenciesMs },
    liveFetches: retrievals.reduce((sum, item) => sum + item.debug.liveFetches, 0),
    cacheHits: retrievals.reduce((sum, item) => sum + item.debug.cacheHits, 0),
    webSearchCalls: retrievals.reduce((sum, item) => sum + (item.debug.webSearchCalls || 0), 0),
    webSearchCacheHits: retrievals.reduce((sum, item) => sum + (item.debug.webSearchCacheHits || 0), 0),
    liveResearchTriggered: retrievals.some((item) => item.debug.liveResearchTriggered),
    localEvidenceBeforeSearch: retrievals.reduce((sum, item) => sum + (item.debug.localEvidenceBeforeSearch || 0), 0),
    googleGroundedSourcesReturned: retrievals.reduce((sum, item) => sum + (item.debug.googleGroundedSourcesReturned || 0), 0),
    googleSearchRequests: retrievals.reduce((sum, item) => sum + (item.debug.googleSearchRequests || 0), 0),
    googleSearchQueries: retrievals.reduce((sum, item) => sum + (item.debug.googleSearchQueries || 0), 0),
    googleSearchLatencyMs: Math.max(...retrievals.map((item) => item.debug.googleSearchLatencyMs || 0)),
    liveSourcesUsed: retrievals.reduce((sum, item) => sum + (item.debug.liveSourcesUsed || 0), 0),
    localSourcesUsed: retrievals.reduce((sum, item) => sum + (item.debug.localSourcesUsed || 0), 0),
    selectedPersonalities: retrievals.map((retrieval) => ({ id: retrieval.personalityId, name: retrieval.personality })),
    perPersonality: retrievals.map((retrieval) => ({ personality: retrieval.personality, debug: retrieval.debug })),
  };
  if (retrievals.some((retrieval) => !retrieval.debug.answerable)) {
    return {
      personality,
      question,
      resolvedQuestion: queryContext.resolvedQuestion,
      queryContext,
      lens: lens ? { id: lens.id, label: lens.label } : null,
      structuredContext: { active_personality_ids: personalityIds, recent_named_entities: queryContext.subjects, recent_topic: queryContext.resolvedQuestion.slice(0, 200), recent_parameters: parameters.map((parameter) => parameter.code) },
      status: "abstained" as const,
      answer: abstentionMessage(personality, question),
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
  const evidenceBudget = options.responseStyle === "research" ? 14 : options.responseStyle === "detailed" ? 11 : options.responseStyle === "simple" ? 5 : isBroadScope(queryContext.scope) ? 9 : 7;
  const selected = prioritizeEvidence(queryContext.resolvedQuestion, evidence, evidenceBudget);
  const bounded = buildBoundedContext(selected, evidenceBudget);
  debug.evidenceRetrievedCount = evidence.length;
  debug.answerIntent = answerIntent(queryContext.resolvedQuestion);
  debug.finalSelectedEvidenceCount = bounded.selected.length;
  debug.parametersRepresented = [...new Set(bounded.selected.flatMap((item) => item.kind === "claim" ? [item.parameterCode].filter((code): code is string => Boolean(code)) : item.parameterCodes || []))];
  debug.retrievedClaimCount = bounded.selected.filter((item) => item.kind === "claim").length;
  debug.retrievedChunkCount = bounded.selected.filter((item) => item.kind === "passage").length;
  debug.sourcesRepresented = [...new Set(bounded.selected.map((item) => item.sourceTitle).filter((title): title is string => Boolean(title)))];
  debug.sourceTypesRepresented = [...new Set(bounded.selected.map((item) => item.sourceType).filter((sourceType): sourceType is string => Boolean(sourceType)))];
  debug.evidenceTypesRepresented = [...new Set(bounded.selected.map((item) => item.kind === "claim" ? item.evidenceType : "source_passage"))];
  if (!bounded.context) {
    return {
      personality,
      question,
      resolvedQuestion: queryContext.resolvedQuestion,
      queryContext,
      lens: lens ? { id: lens.id, label: lens.label } : null,
      structuredContext: { active_personality_ids: personalityIds, recent_named_entities: queryContext.subjects, recent_topic: queryContext.resolvedQuestion.slice(0, 200), recent_parameters: parameters.map((parameter) => parameter.code) },
      status: "abstained" as const,
      answer: abstentionMessage(personality, question),
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

  const conversation = (options.history || []).slice(-2).map((turn) => [
    `User: ${turn.question.slice(0, 200)}`,
    turn.resolvedQuestion ? `Resolved topic: ${turn.resolvedQuestion.slice(0, 240)}` : "",
    // An earlier "not enough evidence" reply says nothing about this question; repeating it invites another refusal.
    turn.answer && !NO_EVIDENCE_REPLY.test(turn.answer) ? `DCF: ${turn.answer.replace(/\[[CS]\d+\]/g, "").slice(0, 500)}` : "",
  ].filter(Boolean).join("\n")).join("\n");
  const identity = answerCacheIdentity(personalityIds, `${queryContext.resolvedQuestion}\n${conversation}`, debug.evidencePolicyMode || "test", bounded.selected, bounded.citations, options.responseStyle);
  debug.answerCacheKey = identity.key;
  debug.estimatedEvidenceTokens = Math.ceil(bounded.context.length / 4);
  const stopCache = stageTimer("ANSWER_CACHE");
  const cached = await readAnswerCache(identity.key, bounded.citations);
  debug.latenciesMs.answerCache = stopCache();
  debug.answerCacheHit = Boolean(cached);
  if (cached) incrementMetric("answerCacheHits");
  const stopGeneration = stageTimer("GENERATION");
  let generated: { text: string; interactionId: string | null; model?: string };
  let usedLocalSynthesis = false;
  const extractive = new ExtractiveSynthesisProvider();
  const fallback = () => extractive.generateGroundedAnswer({ prompt: "", evidence: bounded.selected, citations: bounded.citations, broad: queryContext.broadSynthesis, scope: queryContext.scope, question: queryContext.resolvedQuestion, responseStyle: options.responseStyle });
  const safeFallback = async () => {
    try {
      const result = await fallback();
      if (result.text !== ABSTENTION && !validateAnswerCitations(result.text, bounded.citations))
        throw new Error("Fallback produced invalid or missing citations");
      return result;
    } catch (error) {
      console.error("synthesis_fallback_failed", JSON.stringify({ reason: error instanceof Error ? error.message : String(error), evidenceRecords: bounded.selected.length }));
      return { text: ABSTENTION, interactionId: null };
    }
  };
  if (cached) {
    generated = { text: cached.answer, interactionId: null };
    debug.provider = cached.provider;
    debug.synthesisMode = `cached ${cached.provider}`;
    debug.model = cached.model;
  } else if (!health.healthy) {
    usedLocalSynthesis = true;
    console.warn("synthesis_fallback", JSON.stringify({ reason: health.configured ? "provider_circuit_open" : "provider_not_configured",
      category: health.circuit.category, primaryModel: provider.model, evidenceRecords: bounded.selected.length }));
    debug.generationFallbackReason = "AI synthesis unavailable; showing verified evidence.";
    generated = await safeFallback();
  } else {
    const prompt = buildSynthesisPrompt({ personality, question, resolvedQuestion: queryContext.resolvedQuestion, scope: queryContext.scope, evidenceContext: bounded.context, evidenceRecords: bounded.selected.length, responseStyle: options.responseStyle, conversation, openingTurn: !options.history?.length,
      lens: lens ? { label: lens.label, focus: lens.focus } : null, contextIntent, chronologyNote: chronologyGuidance(categorySlugs) });
    const diagnostics = { evidenceRecords: bounded.selected.length, evidenceCharacters: bounded.context.length,
      promptCharacters: prompt.length, estimatedPromptTokens: Math.ceil(prompt.length / 4) };
    try {
      incrementMetric("synthesisAttempted");
      generated = await provider.generateGroundedAnswer({ prompt, evidence: bounded.selected, citations: bounded.citations, broad: queryContext.broadSynthesis, scope: queryContext.scope, diagnostics });
      if (generated.text === ABSTENTION) {
        console.warn("synthesis_validation", JSON.stringify({ model: generated.model || provider.model, accepted: false,
          reason: "model_abstained_with_answerable_evidence", suppliedCitationCount: bounded.citations.length }));
        throw new Error("Synthesis abstained despite answerable approved evidence");
      }
      if (generated.text !== ABSTENTION && !validateAnswerCitations(generated.text, bounded.citations)) {
        console.warn("synthesis_validation", JSON.stringify({ model: generated.model || provider.model, accepted: false,
          reason: "invalid_or_missing_citation", suppliedCitationCount: bounded.citations.length }));
        throw new Error("Invalid synthesis citations");
      }
      console.info("synthesis_validation", JSON.stringify({ model: generated.model || provider.model, accepted: true,
        abstained: generated.text === ABSTENTION, suppliedCitationCount: bounded.citations.length }));
      incrementMetric("synthesisSucceeded");
      debug.provider = provider.name;
      debug.synthesisMode = "Gemini";
      debug.model = generated.model || provider.model;
      debug.synthesisErrorCategory = null;
      debug.generationFallbackReason = null;
    } catch (error) {
      usedLocalSynthesis = true;
      debug.synthesisErrorCategory = provider.classifyError(error);
      console.warn("synthesis_fallback", JSON.stringify({ reason: debug.synthesisErrorCategory,
        primaryModel: provider.model, evidenceRecords: bounded.selected.length,
        evidenceCharacters: bounded.context.length, promptCharacters: prompt.length }));
      incrementMetric(`synthesis_${debug.synthesisErrorCategory}`);
      debug.generationFallbackReason = "AI synthesis temporarily unavailable; showing verified evidence.";
      // The model read the evidence and found it does not answer a specific question. Loose excerpts would pose as an answer, so say so instead.
      // Excerpts remain the fallback for a general profile, where passages about the person do answer, and whenever the model itself fails.
      const unsupportedFraming = error instanceof Error && /abstained/.test(error.message) && (Boolean(lens || contextIntent) || !isBroadScope(queryContext.scope));
      if (unsupportedFraming) usedLocalSynthesis = false;
      generated = unsupportedFraming ? { text: ABSTENTION, interactionId: null } : await safeFallback();
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
    debug.synthesisMode = "Deterministic fallback";
    debug.model = null;
    debug.extractiveFallbackUsed = true;
    debug.fallbackUsed = true;
    incrementMetric("extractiveFallbacks");
  }
  // Deterministic guard: a generated answer may not assert historical certainty from narrative evidence or settle a contested point.
  const guarded = generated.text.trim() === ABSTENTION || usedLocalSynthesis ? { answer: generated.text, notes: [] as string[] }
    : epistemicSafeguard(generated.text, bounded.selected.map((item) => item.kind === "claim" ? item : { text: item.text, textualLayer: item.textualLayer }));
  debug.epistemicSafeguardNotes = guarded.notes;
  const cleanedAnswer = !guarded.answer.trim() || guarded.answer.trim() === ABSTENTION ? ABSTENTION
    : ensureOpeningIntro(guarded.answer.trim(), personality, bounded.selected, bounded.citations, !options.history?.length);
  if (!cached && !usedLocalSynthesis && cleanedAnswer !== ABSTENTION) {
    await writeAnswerCache(identity, personalityIds, debug.evidencePolicyMode || "test", { answer: cleanedAnswer, provider: debug.provider, model: debug.model });
  }
  const abstained = cleanedAnswer === ABSTENTION;
  const answer = abstained ? abstentionMessage(personality, question) : cleanedAnswer;
  const layers = [...new Set(bounded.selected.map((item) => item.textualLayer).filter(Boolean))];
  const conflicts = layers.length > 1
    ? [{ type: "TEXTUAL_LAYER_VARIANT", message: "Evidence from multiple textual layers was retrieved; the answer should preserve their distinctions.", layers }]
    : [];

  const citedIds = new Set([...answer.matchAll(/\b[CS]\d+\b/g)].map((match) => match[0]));
  const citedEvidence = bounded.selected.map((item, index) => ({ citation: bounded.citations[index], item })).filter((entry) => citedIds.has(entry.citation.id));
  debug.liveSourcesUsed = citedEvidence.filter((entry) => entry.citation.kind === "live_web_source").length;
  debug.localSourcesUsed = citedEvidence.length - debug.liveSourcesUsed;
  debug.evidenceUsedCount = citedEvidence.length;
  return {
    personality,
    question,
    resolvedQuestion: queryContext.resolvedQuestion,
    queryContext,
    lens: lens ? { id: lens.id, label: lens.label } : null,
    structuredContext: { active_personality_ids: personalityIds, recent_named_entities: queryContext.subjects, recent_topic: queryContext.resolvedQuestion.slice(0, 200), recent_parameters: parameters.map((parameter) => parameter.code) },
    status: abstained ? "abstained" as const : usedLocalSynthesis ? "extractive_fallback" as const : "complete" as const,
    answer,
    retrievedParameters: parameters,
    citations: citedEvidence.map((entry) => entry.citation),
    evidence: citedEvidence.map((entry) => ({ citationId: entry.citation.id, ...entry.item })),
    conflicts,
    debug,
    interactionId: generated.interactionId,
  };
}

export async function answerQuestion(question: string, personalityId: string | string[], options: { history?: ConversationQuestion[]; responseStyle?: "simple" | "balanced" | "detailed" | "research" } = {}) {
  incrementMetric("totalAskRequests");
  return withRequestUsage(async (usage) => {
    const started = performance.now();
    const result = await answerQuestionInternal(question, personalityId, options);
    result.debug.generativeCalls = usage.generativeCalls;
    result.debug.geminiCalls = usage.generativeCalls;
    result.debug.embeddingCalls = usage.embeddingCalls;
    result.debug.latenciesMs.total = Math.round(performance.now() - started);
    console.info("ask_research_usage", JSON.stringify({ model: result.debug.model, googleSearchRequests: result.debug.googleSearchRequests || 0, googleSearchQueries: result.debug.googleSearchQueries || 0, googleErrorCategory: result.debug.googleSearchErrorCategory || null, localEvidenceBeforeSearch: result.debug.localEvidenceBeforeSearch || 0, googleGroundedSourcesReturned: result.debug.googleGroundedSourcesReturned || 0, braveTriggered: result.debug.braveTriggered || false, braveCalls: result.debug.webSearchCalls || 0, braveCacheHits: result.debug.webSearchCacheHits || 0, braveQueries: result.debug.braveQueries || [], lens: result.debug.lens || null, contextIntent: result.debug.contextIntent || null, citedProvenance: result.citations.map((citation) => ({ id: citation.id, origin: citation.kind === "live_web_source" ? "live" : "library", claimId: citation.claimId, chunkId: citation.chunkId, approvalOrigin: citation.approvalOrigin, authority: citation.authority })), liveUrlsAccepted: result.debug.liveUrlsAccepted || [], liveUrlsRejected: (result.debug.liveUrlsRejected || []).slice(0, 6), liveSourcesUsed: result.debug.liveSourcesUsed || 0, localSourcesUsed: result.debug.localSourcesUsed || 0, evidenceRetrieved: result.debug.evidenceRetrievedCount || 0, evidenceSelected: result.debug.finalSelectedEvidenceCount || 0, evidenceUsed: result.debug.evidenceUsedCount || 0, latencyMs: result.debug.latenciesMs.total }));
    if (result.debug.liveResearchTriggered) incrementMetric("liveResearchTriggers");
    if (result.debug.semanticFallbackReason && result.debug.semanticFallbackReason !== "semantic_skipped_sufficient_lexical_claim_candidates") incrementMetric("semanticFallbacks");
    return { ...result, debug: { ...result.debug, usageMetrics: usageMetrics() } };
  });
}
