import "server-only";
import { GoogleGenAI } from "@google/genai";
import { boundedProviderCall, classifyProviderError, googleGroundingCircuit } from "@/lib/corpus/provider-health";
import { GENERATION_MODEL } from "@/lib/corpus/gemini";
import type { RetrievedPassage } from "@/lib/corpus/types";
import { inspectSearchSource, isGoogleGroundingRedirect, readGroundedExcerpt, sourceAccess, sourcePriority } from "./search-credibility";
import { recordDiscoveredSource, searchPolicyDecision, type SearchPolicy } from "./search-policy";
import { loadActiveSourceRules } from "./source-registry";
import { answerIntent } from "@/lib/ask/evidence-priority";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { planResearchQueries } from "./research-quality";

export type GroundingResult = {
  evidence: RetrievedPassage[];
  requests: number;
  queries: number;
  latencyMs: number;
  errorCategory: string | null;
};

// Search result placement is not a quality signal. Admit only recognizable source families;
// unknown sources can still be discovered by the existing Brave verification path.
const credibleHost = /(?:^|\.)(?:edu|gov|ac\.uk|ac\.in|edu\.au|org\.uk|britannica\.com|encyclopedia\.com|jstor\.org|cambridge\.org|oup\.com|oxfordacademic\.com|springer\.com|nature\.com|sacred-texts\.com|archive\.org|gutenberg\.org|wisdomlib\.org|vedicheritage\.gov\.in)$/i;
const groundingCache = new Map<string, { expires: number; result: GroundingResult }>();
const poorSource = /(?:^|\.)(?:quora\.com|pinterest\.[a-z.]+|reddit\.com|blogspot\.[a-z.]+|medium\.com)$/i;
const GROUNDING_MODEL = process.env.GEMINI_GROUNDING_MODEL || "gemini-3.5-flash-lite";

export function credibleGroundingUrl(raw: string): { url: string; institution: string } | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || poorSource.test(url.hostname) || !credibleHost.test(url.hostname)) return null;
    return { url: url.toString(), institution: url.hostname.replace(/^www\./, "") };
  } catch { return null; }
}

export function groundedPassages(response: { candidates?: Array<{ groundingMetadata?: {
  groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
  groundingSupports?: Array<{ segment?: { text?: string }; groundingChunkIndices?: number[] }>;
  webSearchQueries?: string[];
} }> }, personalityId: string, personalityName: string, allowUnknown = false): RetrievedPassage[] {
  const metadata = response.candidates?.[0]?.groundingMetadata;
  if (!metadata) return [];
  const chunks = metadata.groundingChunks || [];
  const passages = new Map<string, RetrievedPassage>();
  for (const support of metadata.groundingSupports || []) {
    const statement = support.segment?.text?.replace(/\[[^\]]+\]/g, "").trim();
    if (!statement || statement.length < 25) continue;
    for (const index of support.groundingChunkIndices || []) {
      const web = chunks[index]?.web;
      if (!web?.uri || !web.title) continue;
      const verified = allowUnknown ? basicGroundingUrl(web.uri) : credibleGroundingUrl(web.uri);
      if (!verified) continue;
      const key = `${verified.url}|${statement}`;
      if (passages.has(key)) continue;
      passages.set(key, {
        kind: "passage", id: `google:${index}:${passages.size}`, chunkId: `google:${index}:${passages.size}`,
        sourceId: `google:${index}`, text: statement.slice(0, 500), sectionTitle: null, pageOrSection: null,
        textualLayer: "Search-grounded summary; verify the claim's evidentiary status in the source",
        sourceTitle: web.title, sourceAuthor: null, sourceInstitution: verified.institution,
        sourceUrl: verified.url, sourceType: "live web research", sourceStatus: "discovered",
        personalityId, personalityName, origin: "google_grounding", retrievedAt: new Date().toISOString(),
      });
      if (passages.size >= 20) return [...passages.values()];
    }
  }
  return [...passages.values()];
}

function basicGroundingUrl(raw: string): { url: string; institution: string } | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || poorSource.test(url.hostname)) return null;
    return { url: url.toString(), institution: url.hostname.replace(/^www\./, "") };
  } catch { return null; }
}

export async function searchWithGoogleGrounding(question: string, personalityId: string, personalityName: string, depth: "normal" | "research" = "normal", policy: SearchPolicy = { mode: "credible_web", rules: [] }, gaps: string[] = [], personalityAliases: string[] = [], emphasis = ""): Promise<GroundingResult> {
  const started = performance.now();
  const cacheKey = `${GROUNDING_MODEL}|${personalityId}|${depth}|${question.normalize("NFKC").trim().toLowerCase()}|${gaps.join("|")}|${emphasis}|${policy.mode}|${policy.rules.map((rule) => `${rule.domain}:${rule.status}`).join("|")}`;
  const cached = groundingCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return { ...cached.result, requests: 0, queries: 0, latencyMs: 0 };
  const empty = (errorCategory: string | null, requests = 0, queries = 0): GroundingResult => ({ evidence: [], requests, queries, latencyMs: Math.round(performance.now() - started), errorCategory });
  if (!process.env.GEMINI_API_KEY) return empty("NOT_CONFIGURED");
  if (policy.mode === "approved_domains_only" && !policy.rules.some((rule) => rule.status === "allowed")) return empty("NO_ALLOWED_DOMAINS");
  const circuit = googleGroundingCircuit.state();
  if (circuit.open) return empty(`${circuit.category || "PROVIDER"}_COOLDOWN`);
  try {
    const mapped = await supabaseAdmin.from("source_personalities").select("sources(url)").eq("personality_id", personalityId).limit(100);
    const associatedDomains = new Set((mapped.data || []).flatMap((row) => {
      const source = Array.isArray(row.sources) ? row.sources[0] : row.sources;
      try { return source?.url ? [new URL(source.url).hostname] : []; } catch { return []; }
    }));
    const preferred = policy.mode === "approved_domains_only" ? policy.rules.filter((rule) => rule.status === "allowed").map((rule) => rule.domain) : await loadActiveSourceRules().then((rules) => {
      const eligible = rules.filter((rule) => rule.allow_live_search && rule.evidence_use_status === "approved" && searchPolicyDecision(`https://${rule.domain}/`, policy).allowed);
      const layers = new Set<string>();
      const ranked = [...eligible].sort((left, right) => Number(associatedDomains.has(right.domain)) - Number(associatedDomains.has(left.domain)) || left.priority - right.priority);
      const diverse = ranked.filter((rule) => {
        const layer = rule.default_textual_layer || rule.default_source_type || rule.domain;
        if (layers.has(layer)) return false;
        layers.add(layer);
        return true;
      });
      return diverse.slice(0, 4).map((rule) => rule.domain);
    }).catch(() => [] as string[]);
    const intent = answerIntent(question);
    const queryPlan = planResearchQueries(personalityName, question, gaps, depth === "research" ? 2 : 1);
    const focus = intent === "identity" ? "Cover identity, field or role, and the person's most important documented work. Avoid minor details."
      : intent === "importance" ? "Find major contributions and lasting significance through concrete work and evidence."
        : intent === "teaching" ? "Focus on documented teaching, mentorship, or lessons grounded in the person's actions."
          : intent === "relationship" ? "Focus on the actual interactions and conflict or change between the people."
            : "Answer the specific question directly.";
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await boundedProviderCall((abortSignal) => ai.models.generateContent({
      model: GROUNDING_MODEL || GENERATION_MODEL,
      contents: `Use Google Search now to answer: ${question} (about ${personalityName}). ${focus}${emphasis ? ` ${emphasis}` : ""} Follow this bounded, gap-directed search plan: ${queryPlan.map((item) => `[${item.intent}] ${item.query}`).join("; ")}.${preferred.length ? ` Search ${preferred.slice(0, 3).join(", ")} first when they are relevant to the claim.` : " Search credible primary, university, scholarly, institutional, and reference sources."} ${gaps.length ? `Fill these gaps: ${gaps.slice(0, 2).join("; ")}.` : ""} Give ${depth === "research" ? "a few" : "two"} concise findings supported by searched pages. Treat result snippets only as discovery leads. Distinguish documented fact, scientific result, scholarly interpretation, institutional self-description, and traditional account. For first/priority claims establish chronology and avoid celebratory simplification. Exclude Wikipedia, blogs, forums, and unsourced summaries.${policy.mode === "approved_domains_only" ? ` Use only these allowed domains: ${preferred.join(", ")}.` : " You may discover other credible sources if the preferred sites lack direct support."}`,
      config: { tools: [{ googleSearch: {} }], abortSignal, maxOutputTokens: 1800,
        httpOptions: { retryOptions: { attempts: 1 } } },
    }), depth === "research" ? 18000 : 13000);
    const metadata = response.candidates?.[0]?.groundingMetadata;
    const candidates = groundedPassages(response, personalityId, personalityName, true);
    const inspected = new Map<string, ReturnType<typeof inspectSearchSource>>();
    const outcome = { candidates: candidates.length, notCredible: 0, blocked: new Set<string>(), unreadable: 0, unsupported: 0 };
    const admitted = await Promise.all(candidates.map(async (item) => {
      const url = item.sourceUrl;
      if (!url || (!isGoogleGroundingRedirect(url) && !searchPolicyDecision(url, policy).allowed)) return null;
      if (!inspected.has(url)) inspected.set(url, inspectSearchSource(url, policy, item.sourceTitle || "", preferred));
      const source = await inspected.get(url)!;
      if (!source) { outcome.notCredible += 1; return null; }
      const original = await readGroundedExcerpt(source, item.text, [personalityName, ...personalityAliases], policy);
      if (!original) {
        const access = await sourceAccess(source.url);
        if (access === "blocked") {
          // The site refused the request. Keep it as a lead for a person to follow up; its search summary is not evidence.
          if (!outcome.blocked.has(source.domain) && !searchPolicyDecision(source.url, policy).rule) await recordDiscoveredSource(source.url, item.sourceTitle || source.title, source.category,
            { accessibility: "bibliographic_only", admissionStatus: "discovered", usableEvidence: false, matchReason: "Strong search lead, but the publisher refused automated access; no page content was used." });
          outcome.blocked.add(source.domain);
        } else if (access === "unreadable") outcome.unreadable += 1;
        else outcome.unsupported += 1;
        return null;
      }
      item = { ...item, text: original.text, pageOrSection: original.locator, sourceUrl: original.url, sourceInstitution: source.domain, sourceTitle: original.title, sourceType: source.category, lexicalScore: 1,
        textualLayer: original.identity.evidenceType === "traditional_text" ? "Traditional text; establishes what the text narrates, not historical occurrence" : "Original page retrieved after Google Search; interpret textual status from source",
        evidenceType: original.identity.evidenceType, supportLevel: original.supportLevel, supportReason: original.supportReason,
        workKey: original.identity.workKey, accessibility: "READABLE",
        provenance: { title: original.identity.title, author: original.identity.author, publisher: original.identity.publisher,
          publicationDate: original.identity.publicationDate, journal: original.identity.journal, doi: original.identity.doi,
          isbn: original.identity.isbn, complete: original.identity.provenanceComplete } };
      // Sites already governed by an admin rule or the approved-source registry need no second review.
      if (source.category !== "approved source family" && !searchPolicyDecision(source.url, policy).rule) await recordDiscoveredSource(source.url, item.sourceTitle || source.title, source.category,
        { evidenceType: original.identity.evidenceType, accessibility: "readable", admissionStatus: "admitted", usableEvidence: true,
          matchReason: original.supportReason, workKey: original.identity.workKey });
      return item;
    }));
    // Several findings can resolve to the same passage on the same page; keep it once.
    const unique = new Map<string, RetrievedPassage>();
    for (const item of admitted) if (item && !unique.has(`${item.workKey || item.sourceUrl}|${item.text}`)) unique.set(`${item.workKey || item.sourceUrl}|${item.text}`, item);
    const evidence = [...unique.values()]
      .sort((a, b) => sourcePriority(b.sourceUrl || "", `${b.sourceTitle || ""} ${b.text}`, question, b.sourceType || "") - sourcePriority(a.sourceUrl || "", `${a.sourceTitle || ""} ${a.text}`, question, a.sourceType || ""))
      .slice(0, 8);
    const queries = metadata?.webSearchQueries?.length || 0;
    console.info("grounding_admission", JSON.stringify({ ...outcome, blocked: [...outcome.blocked], admitted: evidence.map((item) => `${item.sourceUrl}${item.pageOrSection ? ` (${item.pageOrSection})` : ""}`) }));
    const result = { evidence, requests: 1, queries, latencyMs: Math.round(performance.now() - started), errorCategory: evidence.length ? null : "NO_CREDIBLE_GROUNDED_EVIDENCE" };
    googleGroundingCircuit.succeed();
    if (evidence.length) {
      if (groundingCache.size >= 100) groundingCache.delete(groundingCache.keys().next().value!);
      groundingCache.set(cacheKey, { expires: Date.now() + 10 * 60_000, result });
    }
    return result;
  } catch (error) {
    const category = classifyProviderError(error);
    if (category === "QUOTA_EXHAUSTED" || category === "RATE_LIMIT") googleGroundingCircuit.fail(category, category === "QUOTA_EXHAUSTED" ? 5 * 60_000 : 60_000);
    return empty(category, 1);
  }
}
