import { parseLocator } from "@/lib/evidence-completion/locator";
import { atomicPropositions, isAttributional } from "@/lib/reconciliation/analysis";
import { DIRECT_EVIDENCE_TYPES } from "./contracts";
import { CLASSIFIER_VERSION, EPISTEMIC_TYPES, type EpistemicType, type SourceClass } from "./types";

export type ClassificationInput = {
  text: string;
  claimKind?: string | null;
  /** Legacy coarse label on the claim; a weak signal only (it conflates claim and evidence). */
  evidenceType?: string | null;
  parameterCode?: string | null;
  /** Epistemic classes of the cited sources. */
  sourceClasses: SourceClass[];
  /** Raw citation locators ("1.65", "Methodological note"). */
  locators: Array<string | null>;
};
export type Classification = {
  type: EpistemicType; confidence: number; needsReview: boolean; compound: boolean; parts: number;
  /** Every type the wording plausibly supports (within two points of the top); used when the type is unresolved. */
  candidates: EpistemicType[];
  signals: Array<{ type: EpistemicType; weight: number; why: string }>; version: string;
};

type Rule = { type: EpistemicType; weight: number; why: string; test: (input: ClassificationInput, text: string) => boolean };

const NEGATED_HISTORY = /\b(?:not|cannot|can't|no|uncertain|unclear|whether|open|without|rather than|do(?:es)? not|never|only)\b[^.;]{0,60}\b(?:histor|verified|establish|date|identif)/i;
const has = (pattern: RegExp) => (_: ClassificationInput, text: string) => pattern.test(text);

/**
 * Deterministic signals, each with a weight and a reason. Explicit wording outweighs legacy labels; source
 * class and parameter are tie-breakers. No personality, tradition, or work names appear here.
 */
const RULES: Rule[] = [
  { type: "METHODOLOGICAL", weight: 4, why: "states how evidence should be labeled, stored, or treated",
    test: has(/\b(?:should|must)\s+(?:not\s+)?(?:be|remain|stay|never|always|attempt|present|force|convert)\b.{0,80}\b(?:label|store|classif|present|treat|record|represent|review|convert|tie|tied|kept|distinguish|distinct|resolution|reduced)\w*/i) },
  { type: "METHODOLOGICAL", weight: 3, why: "refers to the research system or dataset itself",
    test: has(/\b(?:the system|knowledge base|this dataset|the dataset|data model|in DCF|DCF (?:should|records|stores))\b/i) },
  { type: "METHODOLOGICAL", weight: 4, why: "states a research policy or framework requirement",
    test: has(/\b(?:framework|policy|protocol|guidelines?|workflow|review process)\b.{0,60}\b(?:requires?|mandates?|keeps?|flags?)\b|\b(?:mentor (?:review|sign-off)|approved automatically|remain (?:flagged|unapproved|under (?:mentor )?review))\b/i) },
  { type: "METHODOLOGICAL", weight: 2, why: "cited only as a review or method note",
    test: (input) => input.locators.length > 0 && input.locators.every((locator) => /\b(?:review|rule|note|caution|recommendation|flag|lens|methodolog\w*|application|synthesis)\b/i.test(locator || "")) },
  { type: "NORMATIVE_RELEVANCE", weight: 4, why: "argues present-day relevance or application",
    test: has(/\b(?:today|present-day|contemporary (?:reader|life|discussion|ethic|leadership|education|context)|modern (?:reader|readers|audience|leadership|ethic|ethical|education|discussion|life|context|reflection)|relevan(?:t|ce)|lessons? for|can support (?:reflection|discussion)|reflection on|applicab|responsible mastery|for modern)\b/i) },
  { type: "NORMATIVE_RELEVANCE", weight: 1, why: "filed under a relevance parameter", test: (input) => /relevan|contemporary/i.test(input.parameterCode || "") },
  { type: "NORMATIVE_RELEVANCE", weight: 1, why: "legacy kind: contemporary relevance", test: (input) => input.claimKind === "contemporary_relevance" },
  { type: "MODERN_RECEPTION", weight: 4, why: "a named modern interpreter reads or uses the subject (cited source is modern commentary)",
    test: (input, text) => isAttributional(text) && input.sourceClasses.includes("MODERN_COMMENTARY") },
  { type: "MODERN_RECEPTION", weight: 2, why: "describes later or modern reception or interpretation",
    test: has(/\b(?:modern|later|post-\w+|subsequent)\s+(?:\w+\s+){0,2}(?:reception|interpret\w*|reading|commentator|thinker|writer|lens)\b/i) },
  { type: "MODERN_RECEPTION", weight: 1, why: "legacy label: modern interpretation", test: (input) => input.evidenceType === "modern_spiritual_interpretation" },
  { type: "SCHOLARLY_ATTRIBUTION", weight: 4, why: "attributes a view to a named scholar or work (cited source is scholarship)",
    test: (input, text) => isAttributional(text) && input.sourceClasses.includes("SCHOLARLY") && !input.sourceClasses.includes("MODERN_COMMENTARY") },
  { type: "SCHOLARLY_INTERPRETATION", weight: 3, why: "reports what scholars or critical readings argue",
    test: has(/\b(?:scholar(?:s|ly|ship)?|historians?|indolog\w*|critical (?:scholarship|reading|edition)|researchers?|academic (?:reading|interpretation))\b.{0,40}\b(?:interpret|read|argue|see|view|suggest|propose|analy[sz]|treat|regard)\w*/i) },
  { type: "SCHOLARLY_INTERPRETATION", weight: 2, why: "legacy label: scholarly interpretation, with a scholarly or interpretive source cited",
    test: (input) => input.evidenceType === "scholarly_interpretation" && input.sourceClasses.some((value) => value === "SCHOLARLY" || value === "MODERN_COMMENTARY") },
  // The legacy label means "interpretive"; with only primary texts cited, the interpretation is a reading of them.
  { type: "SYNTHETIC_INTERPRETATION", weight: 2, why: "legacy label: interpretive, but only primary texts are cited",
    test: (input) => input.evidenceType === "scholarly_interpretation" && input.sourceClasses.length > 0 && !input.sourceClasses.some((value) => value === "SCHOLARLY" || value === "MODERN_COMMENTARY") },
  { type: "HISTORICAL_INFERENCE", weight: 3, why: "draws a hedged inference about history",
    test: (_, text) => /\b(?:suggests?|may (?:indicate|reflect|preserve|point|represent)|likely|probably|possibly|perhaps|appears to|implies|points to|can be inferred|plausibl\w*)\b/i.test(text)
      && /\b(?:histor|period|date|dating|chronolog|migration|tribe|tribal|social|origin|earl(?:y|ier)|later|composition|era|century|settlement|clan|family)\w*/i.test(text) },
  { type: "HISTORICAL_INFERENCE", weight: 2, why: "legacy label: historical inference", test: (input) => input.evidenceType === "historical_inference" },
  { type: "HISTORICAL_FACT", weight: 4, why: "asserts what actually happened or existed",
    test: (_, text) => /\b(?:historically|historical (?:fact|figure|person|individual|event)|in history|actually (?:lived|was|existed)|real (?:person|individual|figure)|lived (?:in|around|during)|flourished|dated to|\d{3,4}\s?(?:BCE|BC|CE|AD)|centur(?:y|ies) (?:BCE|BC|CE))\b/i.test(text) && !NEGATED_HISTORY.test(text) },
  { type: "CONTESTED", weight: 4, why: "states that something is uncertain, disputed, or unresolved",
    test: has(/\b(?:uncertain(?:ty|ties)?|contested|disputed|debated|unclear|open question|remains? open|disagree\w*|cannot (?:be )?(?:securely |reliably )?(?:dat|identif|establish|determin|verif|resolv)\w*|not (?:securely|clearly|reliably|independently) (?:identif|establish|dat|verif)\w*|whether (?:and how|.{0,40}(?:same|histor|identif|authentic|maps? onto))|may not (?:be|refer to) the same|same (?:figure|person|individual)|conflat\w*|alternative (?:reading|version|account)s?|divergen\w*|competing)\b/i) },
  { type: "CONTESTED", weight: 1, why: "poses an open 'whether' question", test: has(/\bwhether\b/i) },
  { type: "CONTESTED", weight: 2, why: "legacy label: contested", test: (input) => input.evidenceType === "contested" || input.claimKind === "contested" },
  { type: "CONTESTED", weight: 1, why: "filed under a contested/uncertain parameter", test: (input) => /contest|uncertain/i.test(input.parameterCode || "") },
  { type: "SYNTHETIC_INTERPRETATION", weight: 3, why: "reads a pattern or meaning across episodes or sources without attribution",
    test: (_, text) => !isAttributional(text) && /\b(?:together|taken together|combin(?:es|ed|ing)|across (?:the )?(?:texts|episodes|sources|layers|traditions|accounts)|pattern|balanced|overall|represents|symboli[sz]es|embod(?:y|ies)|exemplif\w*|figure of|demonstrat\w*|illustrat\w*|reflects|signals|makes? (?:him|her|them|it) (?:a|an)|theme|portrays? .{0,60} as (?:a|an)|rather than (?:mere|merely|only|a single|one))\b/i.test(text) },
  { type: "SYNTHETIC_INTERPRETATION", weight: 2, why: "wraps narrated or textual facts in an unattributed interpretive frame",
    test: (_, text) => !isAttributional(text) && atomicPropositions(text).some((part) => part.kind === "interpretive") },
  { type: "SYNTHETIC_INTERPRETATION", weight: 1, why: "evaluative language (significance, importance)",
    test: has(/\b(?:significan\w*|important|notabl\w*|particularly rich|central to|key to|valu(?:e|able))\b/i) },
  { type: "TEXTUAL_ASSERTION", weight: 3, why: "says what a text names, attributes, contains, or how it labels something",
    test: has(/\b(?:names?|mentions?|attribut(?:es|ed|ion)|associat(?:es|ed) with|calls?|uses (?:the )?(?:term|designation|name|epithet|word|plural|form)|lists?|refers? to|records?|contains?|preserves?|is addressed to|metadata|designation|epithet|seer(?:s)?|author(?:ship)?|composed|hymns? (?:of|by|to)|verse|stanza|passage|manuscript|inscription|colophon)\b/i) },
  { type: "TEXTUAL_ASSERTION", weight: 1, why: "the claim itself cites a canonical text locator", test: (_, text) => parseLocator(text).kind === "canonical" },
  { type: "TEXTUAL_ASSERTION", weight: 2, why: "legacy label: direct primary text", test: (input) => input.evidenceType === "direct_primary_text" },
  { type: "TRADITIONAL_NARRATIVE", weight: 3, why: "describes what a narrative tells, depicts, or recounts",
    test: has(/\b(?:narrat(?:es|ed|ing)|recount\w*|tells?|told|portrays?|depicts?|describes?|presents?)\b/i) },
  // Naming a story is weaker than saying what it narrates: "the episode can support reflection" is not narrative.
  { type: "TRADITIONAL_NARRATIVE", weight: 1, why: "refers to a story, episode, or account",
    test: has(/\b(?:narrative|story|legend|episode|epic|account|cycle|sequence)\b/i) },
  { type: "TRADITIONAL_NARRATIVE", weight: 2, why: "legacy label: traditional narrative", test: (input) => input.evidenceType === "traditional_narrative" },
  { type: "TRADITIONAL_NARRATIVE", weight: 1, why: "an event statement whose citations are narrative primary texts",
    test: (input) => input.sourceClasses.length > 0 && input.sourceClasses.every((value) => value === "PRIMARY_TEXT") && input.claimKind !== "scholarly_interpretation" },
];

/** Language that reads meaning into facts: a claim carrying it is interpretation, whatever facts it also states. */
const INTERPRETIVE_GLOSS = /\b(?:shows? that|demonstrat\w*|illustrat\w*|reveal(?:s|ing)|suggest(?:s|ing)|symboli[sz]\w*|represent(?:s|ing)|embod(?:y|ies|ying)|making (?:him|her|it|them|the|this|his)|which (?:shows|makes|suggests|gives|provides|means)|thereby|signals|(?:portrays?|depicts?|presents?|casts?|frames?) .{0,60}\bas (?:a|an|prolonged|both|more|less)\b|is best (?:read|understood)|can be read|significan\w*|important|notabl\w*|valu(?:es|able)|unusually|particularly rich|lesson)\b/i;

/** Margin and minimum weight required to assign a type without human review. */
const AUTO_MIN = 4;
const AUTO_MARGIN = 2;

export function classifyClaim(input: ClassificationInput): Classification {
  const text = input.text.trim();
  const signals = RULES.filter((rule) => rule.test(input, text)).map((rule) => ({ type: rule.type, weight: rule.weight, why: rule.why }));
  const scores = new Map<EpistemicType, number>(EPISTEMIC_TYPES.map((type) => [type, 0]));
  for (const signal of signals) scores.set(signal.type, (scores.get(signal.type) || 0) + signal.weight);
  const ranked = [...scores].sort((a, b) => b[1] - a[1] || EPISTEMIC_TYPES.indexOf(a[0]) - EPISTEMIC_TYPES.indexOf(b[0]));
  const [[type, top], [, second]] = ranked;
  const parts = atomicPropositions(text).length;
  const confidence = Number(Math.min(0.99, top ? 0.35 + 0.08 * top + 0.08 * (top - second) : 0).toFixed(2));
  // With no rival signal at all, a legacy label that the wording does not contradict is trusted.
  const unopposedLegacy = second === 0 && top >= 2 && signals.some((signal) => signal.type === type && /^legacy/.test(signal.why));
  // A method note may leave evidence coverage only when it carries no factual proposition of its own.
  const mixedMethod = type === "METHODOLOGICAL" && atomicPropositions(text).some((part) => part.kind === "factual" && !/\b(?:should|must)\b/i.test(part.text));
  // An interpretive gloss is never silently typed as a direct-evidence (factual or textual) claim. A factual
  // contrast ("has its own record rather than being subsumed under ...") is not a gloss.
  const interpretiveAsFact = DIRECT_EVIDENCE_TYPES.has(type) && INTERPRETIVE_GLOSS.test(text);
  const confident = ((top >= AUTO_MIN && top - second >= AUTO_MARGIN) || unopposedLegacy) && !mixedMethod && !interpretiveAsFact;
  const candidates = ranked.filter(([, score]) => score >= Math.max(2, top - 2)).map(([candidate]) => candidate);
  return { type, confidence: confident ? Math.max(confidence, 0.7) : confidence, needsReview: !confident, compound: parts > 1, parts,
    candidates: candidates.length ? candidates : [type],
    signals: signals.sort((a, b) => b.weight - a.weight), version: CLASSIFIER_VERSION };
}
