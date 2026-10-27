import type { ResolvedQuestionContext } from "@/lib/ask/query-context";
import type { QuestionScope } from "@/lib/ask/question-scope";
import type { Citation, RetrievedEvidence } from "./types";
import { normalizeWhitespace, truncateText } from "./text";
import { framedStatement } from "@/lib/claim-epistemics/language";
import { profileEvidenceSalience } from "./rerank";
import { readableEvidence } from "./readable-evidence";
import { isBroadSignificanceQuestion } from "@/lib/live-research/research-quality";
import { detectLens } from "@/lib/ask/lenses";

type EvidenceWithCitation = { item: RetrievedEvidence; citation: Citation };

export function aiSynthesisEnabled(value = process.env.SYNTHESIS_PROVIDER || process.env.AI_SYNTHESIS_MODE || (process.env.GEMINI_API_KEY ? "gemini" : "local")): boolean {
  return value === "gemini";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isFrameworkRecord(item: RetrievedEvidence): boolean {
  return /parameters to study|research framework/i.test(`${item.sourceTitle || ""} ${item.textualLayer || ""}`);
}

function profileScore(entry: EvidenceWithCitation, personality: string): number {
  const item = entry.item;
  const text = normalizeWhitespace(item.text);
  const metadata = item.kind === "claim" ? `${item.parameterName || ""} ${item.fieldLabel || ""}` : "";
  let score = item.kind === "claim" ? 8 : 0;
  if (/identity|profile|vocation|biograph|^role\b|vocation\s*\/\s*role/i.test(metadata)) score += 12;
  if (/historical and textual context|textual history|chronolog/i.test(metadata)) score += 9;
  if (/parampara|lineage/i.test(metadata)) score += 5;
  if (new RegExp(`\\b${escapeRegExp(personality)}\\b`, "i").test(text)) score += 3;
  if (/teacher|guide|seer|sage|rishi|king|poet|author|founder/i.test(text)) score += 5;
  if (/\b(?:in|across) the .{0,80}(?:;|, and|while).{0,80}\bin the\b/i.test(text)) score += 5;
  if (/metadata|metrical|portal records|current source set|research framework|should be stored|does not justify/i.test(text)) score -= 8;
  if (/\b\d+(?:\.\d+)+\b/.test(text)) score -= 3;
  if (isFrameworkRecord(item)) score -= 20;
  return score;
}

function removeEditorialLanguage(value: string): string {
  return value
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !/should be stored|research framework|current source set|safest classification|does not yield a simple measurable verdict/i.test(sentence))
    .join(" ");
}

function simplifyClaim(value: string, personality: string): string {
  const text = removeEditorialLanguage(normalizeWhitespace(value));
  const name = escapeRegExp(personality);
  const crossTradition = new RegExp(
    `^In the ([^,]+) layer, ${name}(?: and (?:his|her|their) family)? (?:is|are) associated with (.+?) as (.+?); in the ([^,]+), ${name} also functions as (.+?)[.]?$`,
    "i",
  );
  const crossMatch = text.match(crossTradition);
  if (crossMatch) {
    const firstTradition = crossMatch[1].replace(/ic$/i, "a");
    const association = crossMatch[2];
    const firstRole = /mantra-seer/i.test(crossMatch[3]) ? "a seer of sacred hymns" : crossMatch[3];
    const secondTradition = crossMatch[4];
    const secondRole = crossMatch[5].replace(/^an?\s+/i, "");
    const secondArticle = /^[aeiou]/i.test(secondRole) ? "an" : "a";
    return `${personality} is ${secondArticle} ${secondRole} in the ${secondTradition}. In the ${firstTradition}, ${personality} and his family are associated with ${association} as ${firstRole}.`;
  }

  const developmentPattern = new RegExp(`^In the (.+?) tradition, ${name} passes through (.+?) and is ultimately recognized as (.+?)[.]`, "i");
  const developmentMatch = text.match(developmentPattern);
  if (developmentMatch) {
    const development = /royal and ascetic statuses/i.test(developmentMatch[2])
      ? "moves from royal life into ascetic life"
      : `moves through ${developmentMatch[2]}`;
    return `The ${developmentMatch[1]} describes a transformation: ${personality} ${development} before being recognized as ${developmentMatch[3]}. This is part of a traditional narrative, not a modern historical record.`;
  }

  const textualHistoryPattern = /^For a source-grounded profile, the safest placement is by textual layer: .+? appears in (.+?), while .+? receives an extended biography in the (.+?) tradition[.] The selected sources do not justify one absolute historical date[.]$/i;
  const textualHistoryMatch = text.match(textualHistoryPattern);
  if (textualHistoryMatch) {
    const earlyTradition = textualHistoryMatch[1].replace(/Rigvedic material/i, "the Rigveda");
    return `The earliest approved sources connect ${personality} with ${earlyTradition}, while the ${textualHistoryMatch[2]} gives a much fuller life story. The evidence does not support one certain historical date.`;
  }

  const powerPattern = new RegExp(`^The ([^ ]+) attributes (.+?) to ${name}, including .*?episodes such as (.+?)[.]`, "i");
  const powerMatch = text.match(powerPattern);
  if (powerMatch) {
    return `${powerMatch[1]} stories portray ${personality} as having ${powerMatch[2]}, especially in stories involving ${powerMatch[3]}. These are traditional religious narratives, not independently verified history.`;
  }

  const designationPattern = new RegExp(`^Vedic seer metadata repeatedly uses the designation (.+?), linking this ${name} tradition with (.+?) terminology[.]?$`, "i");
  const designationMatch = text.match(designationPattern);
  if (designationMatch) {
    return `Vedic records also use the name ${designationMatch[1]}, connecting ${personality} with the ${designationMatch[2]} lineage.`;
  }

  return truncateText(text
    .replace(/\bIn the Rigvedic layer\b/gi, "In the Rigveda")
    .replace(/\bmantra-seers\b/gi, "seers of sacred hymns")
    .replace(/\balso functions as\b/gi, "is also presented as")
    .replace(/\bThe Ramayana attributes\b/gi, "Ramayana stories attribute")
    .replace(/\bnot independently verified empirical events\b/gi, "not independently verified history")
    .replace(/\bVedic seer metadata repeatedly uses the designation\b/gi, "Vedic records also use the name")
    .replace(/\bterminology\b/gi, "lineage"), 360);
}

function simplifyPassage(item: Extract<RetrievedEvidence, { kind: "passage" }>): string {
  const cleaned = removeEditorialLanguage(normalizeWhitespace(item.text));
  const firstSentences = cleaned.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
  const location = item.pageOrSection ? ` (${item.pageOrSection})` : "";
  return `${item.sourceTitle}${location} describes: ${truncateText(firstSentences, 300)}`;
}

function simplified(entry: EvidenceWithCitation, personality: string): string {
  return entry.item.kind === "claim"
    ? framedStatement({ ...entry.item, text: simplifyClaim(entry.item.text, personality) })
    : simplifyPassage(entry.item);
}

/** Research-method notes are about how evidence is handled, not about the subject; they never lead an answer. */
function isMethodNote(item: RetrievedEvidence): boolean {
  return item.kind === "claim" && item.epistemicType === "METHODOLOGICAL";
}

function withCitation(entry: EvidenceWithCitation, personality: string): string {
  return `${simplified(entry, personality)} [${entry.citation.id}]`;
}

export function synthesizeFromLocalEvidence(
  personality: string,
  selected: RetrievedEvidence[],
  citations: Citation[],
  context: Pick<ResolvedQuestionContext, "broadSynthesis" | "subjectiveSuperlative">,
): string {
  const allPaired = selected
    .map((item, index) => ({ item, citation: citations[index] }))
    .filter((entry): entry is EvidenceWithCitation => Boolean(entry.citation));
  const withoutFramework = allPaired.filter((entry) => !isFrameworkRecord(entry.item) && !isMethodNote(entry.item));
  const paired = withoutFramework.length > 0 ? withoutFramework : allPaired;
  const unique = paired.filter((entry, index, all) =>
    all.findIndex((candidate) => normalizeWhitespace(candidate.item.text) === normalizeWhitespace(entry.item.text)) === index,
  );

  if (context.broadSynthesis) {
    const ranked = [...unique].sort((left, right) => profileScore(right, personality) - profileScore(left, personality));
    const overview = ranked[0] || unique[0];
    const supporting = ranked.filter((entry) => entry !== overview).slice(0, 2);
    const opening = context.subjectiveSuperlative
      ? `The available sources do not prove that ${personality} had one objectively “biggest” contribution. They point instead to several important roles.`
      : withCitation(overview, personality);
    const details = context.subjectiveSuperlative
      ? [overview, ...supporting].filter(Boolean).map((entry) => `- ${withCitation(entry, personality)}`).join("\n\n")
      : supporting.map((entry) => `- ${withCitation(entry, personality)}`).join("\n\n");
    return `### In brief\n\n${opening}${details ? `\n\n### What the sources emphasize\n\n${details}` : ""}`;
  }

  const [primary, ...rest] = unique.slice(0, 4);
  const supporting = rest.map((entry) => `- ${withCitation(entry, personality)}`).join("\n\n");
  return `### Short answer\n\n${withCitation(primary, personality)}${supporting ? `\n\n### Supporting context\n\n${supporting}` : ""}`;
}

function layerGroup(item: RetrievedEvidence): string {
  const layer = `${item.textualLayer || ""} ${item.sourceTitle || ""}`;
  const type = item.kind === "claim" ? item.epistemicType || "" : "";
  if (item.kind === "claim" && /\b(?:rigved\w*|vedic)\b[\s\S]{0,220}\b(?:ramayana|epic)\b/i.test(item.text)) return "cross-layer synthesis";
  if (type === "CONTESTED" || type === "HISTORICAL_INFERENCE" || /historical|contested/i.test(layer)) return "historical limits and disputed points";
  if (/SCHOLARLY|SYNTHETIC|MODERN|NORMATIVE/.test(type) || /scholar|interpretation|modern/i.test(layer)) return "interpretation and later reception";
  if (/rigveda|vedic|hymn/i.test(layer)) return "early textual picture";
  if (/ramayana|epic|narrative/i.test(layer) || type === "TRADITIONAL_NARRATIVE") return "later narrative";
  return "other supported context";
}

function relevantWords(value: string): Set<string> {
  return new Set(value.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu)?.filter((word) => !/^(what|when|where|which|about|with|from|this|that)$/.test(word)) || []);
}

function usableFallbackPassage(item: Extract<RetrievedEvidence, { kind: "passage" }>, question: string): string | null {
  const text = readableEvidence(item.text);
  if (!text || /skip to main content|cookie preferences|privacy policy|all rights reserved|subscribe now|sign in to continue/i.test(text.slice(0, 220))) return null;
  const lens = detectLens(question);
  const broadSignificance = isBroadSignificanceQuestion(question) && !/\b(?:effect|discovery|work|book|event|award|institution)\b/i.test(question);
  const focus = lens ? [] : [...relevantWords(question.replace(item.personalityName || "", ""))]
    .filter((word) => !/^(known|important|significant|similar|there|time|personality|selected|context|topic|related)$/.test(word));
  const asksWhy = /\b(?:why|important|significant|impact|big deal)\b/i.test(question);
  const asksComparison = /\b(?:similar|comparable|contemporar|anyone else|someone else)\b/i.test(question);
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 40 && sentence.length <= 420 && sentence.split(/\s+/).length >= 8)
    .filter((sentence) => !/navigation|table of contents|download pdf|read more|click here|doi:|http[s]?:\/\//i.test(sentence));
  const surname = (item.personalityName || "").split(/\s+/).at(-1) || "";
  const contribution = /\b(?:founded|established|created|built|developed|discovered|invented|pioneered|introduced|led|advocated|contributed|transformed)\b|\b(?:is|was|became)\b.{0,100}\b(?:founder|industrialist|reformer|scientist|artist|writer|poet|educator|teacher|composer|filmmaker|researcher|entrepreneur)\b/i;
  const firstName = (item.personalityName || "").split(/\s+/)[0] || "";
  const ranked = sentences.map((raw) => {
    const nameAt = firstName ? raw.toLowerCase().indexOf(firstName.toLowerCase()) : -1;
    const sentence = broadSignificance && nameAt > 0 && /\b(?:birthday|born in|age|nationality|read more)\b/i.test(raw.slice(0, nameAt))
      ? raw.slice(nameAt) : raw;
    return { sentence, overlap: focus.filter((word) => relevantWords(sentence).has(word)).length };
  })
    .filter(({ sentence, overlap }) => (!focus.length || overlap > 0) && (!lens || lens.evidence.test(sentence))
      && (!broadSignificance || item.supportLevel === "STRONG" && sentence.toLowerCase().includes(surname.toLowerCase())
        && !/^\s*\d+\s+(?:what|why|how|who|when|which)\b/i.test(sentence)
        && !/\b(?:read more|click here|copyright)\b|https?:\/\/|\b[a-z0-9-]+\.(?:com|org|net|in)\b/i.test(sentence) && contribution.test(sentence))
      && (!asksWhy || Boolean(lens) || /because|led to|enabled|allowed|opened|first|new|changed|impact|significan|important|influenc|resulted|provided/i.test(sentence))
      && (!asksComparison || /\b(?:similar|comparable|parallel|contemporar|independent(?:ly)?|another|other (?:scientists?|physicists?|researchers?|groups?|experiments?)|also (?:studied|worked|discovered|observed))\b/i.test(sentence)))
    .sort((a, b) => b.overlap - a.overlap);
  return ranked[0]?.sentence || null;
}

function proposition(item: RetrievedEvidence): string {
  const raw = item.kind === "claim" ? simplifyClaim(item.text, item.personalityName || "the subject") : normalizeWhitespace(item.text).split(/(?<=[.!?])\s+/)[0];
  return truncateText(raw.replace(/^[•\-\s]+/, "").replace(/\s*\[[CS]\d+\]/g, ""), item.kind === "claim" ? 245 : 145).replace(/[;,:\s]+$/, "");
}

type PersonAnswerIntent = "profile" | "importance" | "actions" | "teaching" | "relationship" | "transformation";
type PersonFact = EvidenceWithCitation & { text: string };

function personAnswerIntent(question: string, scope?: QuestionScope): PersonAnswerIntent | null {
  if (scope === "CONTESTED_OR_HISTORICAL" || scope === "COMPARISON" || scope === "TEXT_SPECIFIC") return null;
  if (/\b(?:teach|taught|instruct|learn from)\b/i.test(question)) return "teaching";
  if (scope === "RELATIONSHIP") return "relationship";
  if (/\bhow\b.*\b(?:become|became|attain|reach)\b/i.test(question)) return "transformation";
  if (scope === "BROAD_SIGNIFICANCE") return "importance";
  if (/\bwhat (?:did|does)\b.{2,100}\bdo\??$/i.test(question)) return "actions";
  return scope === "BROAD_PROFILE" ? "profile" : null;
}

function personFact(entry: EvidenceWithCitation): PersonFact {
  return { ...entry, text: normalizeWhitespace(entry.item.text) };
}

function factScore(fact: PersonFact, question: string): number {
  const item = fact.item;
  const code = item.kind === "claim" ? item.parameterCode || "" : "";
  const words = relevantWords(question);
  const overlap = [...words].filter((word) => relevantWords(fact.text).has(word)).length;
  return overlap * 4 + profileEvidenceSalience(fact.text, code) / 3
    + (item.kind === "claim" ? 10 : 0)
    + (item.kind === "claim" && item.contractStatus === "SUPPORTED" ? 3 : 0)
    + (fact.text.length >= 55 && fact.text.length <= 260 ? 4 : 0)
    + (/\b(?:asks?|requests?|negotiates?|teaches?|transmits?|guides?|leads?)\b/i.test(fact.text) ? 7 : 0)
    - (/\b(?:presents|describes|provides|emphasizes|explicitly|retrospective|phase)\b/i.test(fact.text) ? 9 : 0)
    - (/\b(?:metadata|current corpus|source set|selected sources|does not securely|do not identify|rather than|database|framework)\b/i.test(fact.text) ? 30 : 0);
}

function factSentence(fact: PersonFact): string {
  const statement = proposition(fact.item)
    .replace(/[.!?\s]+$/, "")
    .replace(/^[^:]{0,105}relationship is central to the epic biography:\s*/i, "")
    .replace(/, (?:showing|adding|providing|giving) (?:an? |the )?(?:explicitly |textual |authoritative |relational )?[^.]+$/i, "")
    .replace(/, (?:so the relationship|making [^,]+ the final status)[^.]+$/i, "")
    .replace(/^In the ([^,]+) narrative, (.+?) is explicitly presented first as (.+?) before the culmination of (?:his|her|their) (.+)$/i,
      (_match, work: string, subject: string, earlyRole: string, change: string) => `In the ${work}, ${subject} begins as ${earlyRole} before undergoing ${/^[aeiou]/i.test(change) ? "an" : "a"} ${change}`)
    .replace(/^In ([^,]+), (.+?) functions as (.+?)'s teacher, transmitting (.+?) and guiding (.+?) during their journey$/i,
      "In $1, $2 teaches $4 to $3 and guides $5 on their journey")
    .replace(/^In the ([^,]+), (.+?) is a major guide and teacher of (.+?); he brings them from (.+?) and transmits (.+)$/i,
      "In the $1, $2 transmits $5 while guiding $3 from $4")
    .replace(/^Mithila becomes [^,]+, with (.+?) moving from [^,]+ into (.+)$/i,
      "$1 travels to $2 in Mithila")
    .replace(/^Conflict over (.+?) becomes a turning point in (.+?)'s movement from (.+?) toward (.+)$/i,
      "The conflict over $1 marks $2's turn from $3 toward $4")
    .replace(/^The (.+?) account culminates with (.+?) recognizing (.+?) as (.+)$/i,
      "The $1 ends with $2 recognizing $3 as $4")
    .replace(/^The post-(.+?) scene describes (.+?)'s affection toward (.+?) before he transfers the (.+)$/i,
      "After the $1 episode, $2 transfers the $4 to $3")
    .replace(/^(.+?)'s weapon instruction to (.+?) includes how to (.+?) after it has been invoked(?:, so .+)?$/i,
      "The cited evidence describes $1 teaching $2 how to $3 after invocation")
    .replace(/^The transformation narrative culminates not merely with divine recognition but with (.+?)'s explicit acceptance of (.+?) as (.+)$/i,
      "$1 ultimately accepts $2 as $3");
  const framed = fact.item.kind === "claim"
    ? framedStatement({ ...fact.item, text: statement[0]?.toUpperCase() + statement.slice(1) })
    : `The ${fact.item.sourceTitle || "approved passage"} describes ${statement[0]?.toLowerCase() || ""}${statement.slice(1)}`;
  return `${framed.replace(/[.!?\s]+$/, "")}. [${fact.citation.id}]`;
}

function matchesPersonSlot(slot: string, fact: PersonFact, name: string, intent: PersonAnswerIntent, target: string | null): boolean {
  const text = fact.text;
  const namesSubject = new RegExp(`\\b${escapeRegExp(name)}\\b`, "i").test(text);
  if (intent === "relationship" && target && !text.toLowerCase().includes(target.toLowerCase())) return false;
  if (slot === "identity") return namesSubject && /\b(?:is|was|functions? as|presented as|portrays?\b.{0,40}\bas)\b.{0,90}\b(?:sage|seer|rishi|teacher|guide|king|queen|ruler|ascetic)\b/i.test(text);
  if (slot === "protection") return namesSubject && /\b(?:asks?|requests?|negotiat\w*|takes?|brings?)\b.{0,150}\b(?:protect\w*|defend\w*|sacrifice|ritual)\b/i.test(text);
  if (slot === "teaching") return namesSubject && /\b(?:teaches?|taught|teacher|instruct\w*|transmit\w*|impart\w*|guru)\b/i.test(text)
    && !/\bteaching phase\b/i.test(text);
  if (slot === "weapons") return namesSubject && /\b(?:weapons?|astras?)\b/i.test(text)
    && /\b(?:weapon instruction|teach\w*[^.]{0,70}(?:weapons?|astras?)|transfer\w*[^.]{0,40}(?:weapons?|astras?)|bestow\w*[^.]{0,40}(?:weapons?|astras?)|neutraliz\w*|withdraw)\b/i.test(text);
  if (slot === "journey") return namesSubject && /\b(?:journey|lead\w*|led|travel\w*|Mithila)\b/i.test(text)
    && !/\b(?:rigveda|vedic)\b/i.test(text);
  if (slot === "relation") return /\brelationship\b/i.test(text) && /\b(?:conflict|rival\w*|dispute)\b/i.test(text) && /\b(?:recogniz\w*|accept\w*|culminat\w*)\b/i.test(text);
  if (slot === "beginning" && intent === "relationship") return /\b(?:initial\w*|early|begins?|first)\b/i.test(text) && /\b(?:hospitality|visit|meeting|relationship)\b/i.test(text);
  if (slot === "beginning" && intent === "transformation") return /\b(?:conflict|dispute|turning point|royal power|kingly sage)\b/i.test(text)
    && /\b(?:ascetic|transformation|brahmarshi)\b/i.test(text) && !/\bculminat\w*\b/i.test(text);
  if (slot === "development" && intent === "transformation") return /\b(?:tapas|austerit\w*|penance|ascetic practice|self-discipline)\b/i.test(text)
    && !/\b(?:recogniz\w*|accept\w*|final status)\b/i.test(text);
  return Boolean(slotsForPerson[slot]?.test(text));
}

const slotsForPerson: Record<string, RegExp> = {
  vedic: /\b(?:ved[ia]\w*|rigveda|mandala|hymn|mantra-seer)\b/i,
  development: /\b(?:kingly sage|ascetic transformation|transform\w*|becom\w* an? ascetic|became a sage|brahmarshi)\b|\broyal\b.{0,90}\bascetic\b/i,
  conflict: /\b(?:conflict|rival\w*|dispute|confront\w*|Shabala|Brahma-danda)\b/i,
  recognition: /\b(?:recogniz\w*|accept\w*|final status|culminat\w*).*\b(?:brahmarshi|sage)\b/i,
};

function combineFacts(first: PersonFact, second: PersonFact): string {
  const left = factSentence(first).replace(/\. \[([^\]]+)\]$/, " [$1]");
  const sharedWork = relevantWords(first.item.sourceTitle || "").size > 0
    && [...relevantWords(first.item.sourceTitle || "")].some((word) => word.length > 5 && relevantWords(second.item.sourceTitle || "").has(word));
  const secondWorkNamed = [...relevantWords(second.item.sourceTitle || "")].some((word) => word.length > 5 && relevantWords(left).has(word));
  const right = (sharedWork || secondWorkNamed)
    ? factSentence(second).replace(/^In (?:the )?[^,]{1,75},\s*/i, "")
    : factSentence(second);
  const name = first.item.personalityName || second.item.personalityName;
  const pronoun = /\bhis\b/i.test(first.text + second.text) ? "he" : /\bher\b/i.test(first.text + second.text) ? "she" : null;
  const joined = name && pronoun ? right.replace(new RegExp(`^${escapeRegExp(name)}\\b`), pronoun) : right;
  return `${left}; ${/^(?:In|The|After|Before|At)\b/.test(joined) ? joined[0].toLowerCase() + joined.slice(1) : joined}`;
}

/** Deterministic planning for ordinary person questions; only selected claim text supplies facts. */
function composePersonAnswer(entries: EvidenceWithCitation[], scope: QuestionScope | undefined, question: string, responseStyle: "simple" | "balanced" | "detailed" | "research"): string | null {
  const intent = personAnswerIntent(question, scope);
  if (!intent) return null;
  const facts = entries.filter(({ item }) => item.kind === "claim")
    .map(personFact)
    .filter((fact) => fact.text.length > 20 && !/\b(?:metadata|current corpus|source set|selected sources|research framework|database should|should be tagged)\b/i.test(fact.text));
  if (!facts.length) return null;
  const name = facts[0].item.personalityName
    || question.match(/\b(?:who is|who was|tell me about|why is|what did|how did)\s+([A-Z][\p{L}]+(?:\s+[A-Z][\p{L}]+)?)/iu)?.[1]
    || facts.map((fact) => fact.text.match(/\b(?!The\b|In\b|At\b|After\b|Before\b|When\b|During\b)[A-Z][\p{L}]+(?:\s+[A-Z][\p{L}]+)?/u)?.[0]).find(Boolean)
    || null;
  if (!name) return null;
  const plan: Record<PersonAnswerIntent, string[]> = {
    profile: ["identity", "development", "protection", "teaching", "vedic"],
    importance: ["vedic", "teaching", "development", "protection", "identity"],
    actions: ["development", "protection", "teaching", "journey"],
    teaching: ["teaching", "weapons"],
    relationship: ["relation", "beginning", "conflict", "recognition"],
    transformation: ["beginning", "development", "recognition"],
  };
  const chosen: Array<{ slot: string; fact: PersonFact }> = [];
  const target = intent === "relationship" ? question.match(/\b(?:with|between|and)\s+([\p{L}][\p{L}\s'-]+)\??$/iu)?.[1]?.trim() || null : null;
  for (const slot of plan[intent]) {
    const options = facts.filter((fact) => !chosen.some((picked) => picked.fact.citation.id === fact.citation.id)
      && matchesPersonSlot(slot, fact, name, intent, target)
      && (intent !== "teaching" || slot === "journey" || /\b(?:teach\w*|instruct\w*|transmit\w*|impart\w*|weapon\w*|astras?|mantras?)\b/i.test(fact.text)));
    const slotScore = (fact: PersonFact) => factScore(fact, question)
      + (slot === "identity" && /\b(?:rigveda|vedic)\b/i.test(fact.text) && /\b(?:ramayana|epic)\b/i.test(fact.text) ? 20 : 0)
      + (slot === "identity" && /\b(?:is|was) an? (?:sage|seer|rishi|ascetic|king|queen|ruler)\b/i.test(fact.text) ? 20 : 0)
      + (slot === "teaching" && /\b(?:transmit\w*|teaches?|taught|impart\w*)\b/i.test(fact.text) ? 16 : 0)
      + (slot === "weapons" && /\b(?:weapon instruction|neutraliz\w*|withdraw)\b/i.test(fact.text) ? 40 : 0)
      + (slot === "beginning" && /\bhospitality\b/i.test(fact.text) ? 15 : 0)
      + (slot === "protection" && /\bdirectly negotiat\w*\b/i.test(fact.text) ? 12 : 0);
    options.sort((a, b) => slotScore(b) - slotScore(a));
    if (options[0]) chosen.push({ slot, fact: options[0] });
  }
  const cap = responseStyle === "simple" ? 2 : responseStyle === "research" ? 6 : responseStyle === "detailed" ? 5 : 4;
  const picked = chosen.slice(0, cap);
  if (!picked.length) return null;
  const bySlot = (slot: string) => picked.find((part) => part.slot === slot)?.fact;
  const paragraphs: string[] = [];
  if (intent === "importance") {
    const reasonFacts = picked.filter(({ slot }) => slot !== "protection").slice(0, 3);
    const reasons = reasonFacts.map(({ slot, fact }) => ({
      vedic: /\bseer\b|mantra-seer/i.test(fact.text) ? "a Vedic seer" : "a figure associated with Vedic texts",
      teaching: "a teacher and guide",
      development: /\bkingly sage\b/i.test(fact.text) ? "a kingly sage who undergoes ascetic transformation" : "a figure in an ascetic transformation story",
      identity: "a sage or seer",
    }[slot])).filter(Boolean);
    const refs = reasonFacts.map(({ fact }) => `[${fact.citation.id}]`).join(" ");
    const list = reasons.length > 1 ? `${reasons.slice(0, -1).join(", ")}, and ${reasons.at(-1)}` : reasons[0];
    paragraphs.push(`${name} matters as ${list}. ${refs}`);
    const [first, second, ...rest] = picked.map(({ fact }) => fact);
    if (first && second) paragraphs.push(combineFacts(first, second));
    else if (first) paragraphs.push(factSentence(first));
    if (rest.length) paragraphs.push(rest.map(factSentence).join(" "));
  } else if (intent === "profile") {
    const identity = bySlot("identity");
    const development = bySlot("development");
    if (identity && development) paragraphs.push(combineFacts(identity, development));
    else paragraphs.push(factSentence(identity || development || picked[0].fact));
    const deeds = [bySlot("protection"), bySlot("teaching")].filter((fact): fact is PersonFact => Boolean(fact));
    if (deeds.length === 2) paragraphs.push(combineFacts(deeds[0], deeds[1]));
    else if (deeds.length) paragraphs.push(factSentence(deeds[0]));
    const vedic = bySlot("vedic");
    if (vedic && vedic !== identity && vedic !== development && !deeds.includes(vedic)) paragraphs.push(factSentence(vedic));
  } else if (intent === "actions") {
    const [first, second, ...rest] = picked.map(({ fact }) => fact);
    paragraphs.push(second ? combineFacts(first, second) : factSentence(first));
    if (rest.length) paragraphs.push(rest.map(factSentence).join(" "));
  } else if (intent === "teaching") {
    const [first, second, ...rest] = picked.map(({ fact }) => fact);
    paragraphs.push(second ? combineFacts(first, second) : factSentence(first));
    if (rest.length) paragraphs.push(rest.map(factSentence).join(" "));
  } else if (intent === "relationship") {
    const [first, second, ...rest] = picked.map(({ fact }) => fact);
    paragraphs.push(second ? combineFacts(first, second) : factSentence(first));
    if (rest.length) paragraphs.push(rest.map((fact) => {
      const rendered = factSentence(fact);
      const sameWork = [...relevantWords(first.item.sourceTitle || "")].some((word) => word.length > 5 && relevantWords(fact.item.sourceTitle || "").has(word));
      return sameWork ? rendered.replace(/^In the traditional narrative,\s*/i, "") : rendered;
    }).join(" "));
  } else {
    const beginning = bySlot("beginning") || bySlot("development") || picked[0].fact;
    const recognition = bySlot("recognition");
    const middle = picked.map(({ fact }) => fact).filter((fact) => fact !== beginning && fact !== recognition);
    paragraphs.push(middle[0] ? combineFacts(beginning, middle[0]) : factSentence(beginning));
    if (recognition && recognition !== beginning) paragraphs[0] += ` ${factSentence(recognition)}`;
    if (!/^\b(?:In|According to|The [^,]{0,55} (?:narrates|portrays|describes))\b/i.test(paragraphs[0])) {
      const work = beginning.item.sourceTitle?.split(/\s+[—–-]\s+|,/)[0]?.trim();
      if (work && !/^source\b/i.test(work)) paragraphs[0] = `In the ${work}, ${paragraphs[0][0].toLowerCase()}${paragraphs[0].slice(1)}`;
    }
  }
  return paragraphs.filter(Boolean).join("\n\n");
}

/** A bounded, claim-led research summary for provider outages. Passage-only answers stay short. */
export function renderExtractiveEvidence(selected: RetrievedEvidence[], citations: Citation[], broad: boolean, scope?: QuestionScope, question = "", responseStyle: "simple" | "balanced" | "detailed" | "research" = "balanced"): string {
  const questionWords = relevantWords(question);
  const historicalQuestion = /histor|confidence|certain|actually say/i.test(question);
  const scholarlyQuestion = /scholar|interpret/i.test(question);
  const relationshipQuestion = scope === "RELATIONSHIP";
  const textualComparison = /rigved|vedic/i.test(question) && /ramayana|epic/i.test(question);
  const seen = new Set<string>();
  const entries = selected.map((item, index) => ({ item: item.kind === "passage" ? { ...item, text: usableFallbackPassage(item, question) || "" } : item, citation: citations[index] }))
    .filter((entry): entry is EvidenceWithCitation => Boolean(entry.citation) && !isFrameworkRecord(entry.item) && !isMethodNote(entry.item))
    .filter(({ item }) => item.text.length > 0)
    .filter(({ item }) => !/current corpus|knowledge base|should be stored|should remain separately tagged|should itself be represented|can be used to teach|a modern learner|current source set/i.test(item.text))
    .filter(({ item }) => {
      const key = [...relevantWords(item.text)].join(" ") || normalizeWhitespace(item.text).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const claims = entries.filter(({ item }) => item.kind === "claim");
  const pool = entries.some(({ item, citation }) => item.kind === "passage" && citation.kind === "live_web_source")
    ? entries : claims.length ? claims : entries.filter(({ item }) => item.kind === "passage");
  const composed = composePersonAnswer(pool, scope, question, responseStyle);
  if (composed) return composed;
  const historicalPool = historicalQuestion ? pool.filter(({ item }) => item.kind === "claim" && (
    item.epistemicType === "TEXTUAL_ASSERTION" || item.epistemicType === "HISTORICAL_FACT" || item.epistemicType === "HISTORICAL_INFERENCE"
    || /historical biography|historical individual|historically|historical evidence|date|textual layers/i.test(item.text)
  ) && item.epistemicType !== "NORMATIVE_RELEVANCE") : pool;
  const interpretationPool = scholarlyQuestion ? pool.filter(({ item }) => item.kind === "claim" && (
    item.epistemicType === "SCHOLARLY_INTERPRETATION" || item.epistemicType === "SYNTHETIC_INTERPRETATION"
    || /contrast|basis of authority|interprets?|reading|scholarly|transformation motif/i.test(item.text)
  ) && /transform|king|royal|ascetic|brahmarshi|kshatriya|brahma/i.test(item.text)) : pool;
  const eligible = historicalQuestion ? historicalPool : scholarlyQuestion && interpretationPool.length ? interpretationPool : pool;
  const score = (entry: EvidenceWithCitation) => {
    const item = entry.item;
    const words = relevantWords(`${item.text} ${item.kind === "claim" ? `${item.parameterName} ${item.fieldLabel}` : item.parameterNames?.join(" ") || ""}`);
    const overlap = [...questionWords].filter((word) => words.has(word)).length;
    const group = layerGroup(item);
    const historical = historicalQuestion || /contested|disput/i.test(question);
    const significance = scope === "BROAD_SIGNIFICANCE";
    const code = item.kind === "claim" ? item.parameterCode || "" : item.parameterCodes?.join(" ") || "";
    const broadPriority = broad ? (significance
      ? /textual_contribution/.test(code) ? 22 : /role/.test(code) ? 16 : 0
      : /role/.test(code) ? 22 : /textual_contribution/.test(code) ? 16 : 0) : 0;
    const interpretive = scholarlyQuestion ? (/transformation|brahmarshi|kshatriya|ascetic|kingly/i.test(item.text) ? 15 : 0) + (/contrast|basis of authority|interprets?/.test(item.text) ? 20 : 0) : 0;
    const relationship = relationshipQuestion ? (/conflict|rival/i.test(item.text) ? 12 : 0) + (/recognition|acceptance|brahmarshi/i.test(item.text) ? 18 : 0) : 0;
    return overlap * 12 + interpretive + relationship + (historical && group === "historical limits and disputed points" ? 24 : 0)
      + broadPriority
      + (scope === "BROAD_PROFILE" ? profileEvidenceSalience(item.text, code) : 0)
      + (item.kind === "claim" ? 8 + Math.floor(profileScore(entry, item.personalityName || "") / 3) : 0)
      + (item.kind === "claim" && item.contractStatus === "SUPPORTED" ? 2 : 0)
      - Math.max(0, (item.text.match(/,/g)?.length || 0) - 3) * 4;
  };
  const ranked = [...eligible].sort((a, b) => score(b) - score(a));
  const limit = responseStyle === "simple" ? 2 : responseStyle === "research" ? 5 : responseStyle === "detailed" || scope === "BROAD_PROFILE" ? 4 : broad ? 3 : 2;
  const anchor = broad ? ranked.find(({ item }) => layerGroup(item) === "cross-layer synthesis") : undefined;
  const early = textualComparison ? ranked.find(({ item }) => layerGroup(item) === "early textual picture") : undefined;
  const later = textualComparison ? ranked.find((entry) => /ramayana|bala kanda/i.test(entry.item.text) && entry !== early) : undefined;
  const chosen: EvidenceWithCitation[] = textualComparison && early && later ? [early, later] : anchor ? [anchor] : [];
  const groupCounts = new Map<string, number>();
  for (const entry of chosen) groupCounts.set(layerGroup(entry.item), 1);
  for (const entry of ranked) {
    if (chosen.includes(entry)) continue;
    const group = layerGroup(entry.item);
    if (chosen.length >= limit) break;
    if (groupCounts.get(group) && ranked.some((candidate) => !groupCounts.has(layerGroup(candidate.item))) && broad && scope !== "BROAD_PROFILE") continue;
    chosen.push(entry);
    groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
  }
  if (!chosen.length) return "The available sources do not contain enough evidence to answer that fully.";
  if (historicalQuestion && !chosen.some(({ item }) => item.kind === "claim" && (item.epistemicType === "TEXTUAL_ASSERTION" || item.epistemicType === "HISTORICAL_FACT" || /historical biography|historical individual|historically/i.test(item.text))))
    return "The available sources do not contain enough evidence to answer that fully.";
  const sentence = ({ item, citation }: EvidenceWithCitation) => {
    const statement = item.kind === "passage" && scope === "BROAD_SIGNIFICANCE" ? item.text : proposition(item);
    const framed = item.kind === "claim" ? framedStatement({ ...item, text: statement }) : statement;
    return `${framed.replace(/[.!?\s]+$/, "")}. [${citation.id}]`;
  };
  const [lead, ...rest] = chosen;
  const paragraphs: string[] = [];
  if (textualComparison && early && later) {
    const name = lead.item.personalityName || "this figure";
    paragraphs.push(`The earlier Vedic evidence associates material with ${name}, while the Ramayana develops an extended sage narrative. These are different textual layers, not a verified continuous biography. [${early.citation.id}] [${later.citation.id}]`);
  }
  if (historicalQuestion) {
    const name = lead.item.personalityName || "The subject";
    paragraphs.push(`The evidence supports statements about texts associated with ${name}, but it does not establish the later narrated life as a verified historical biography. ${chosen.slice(0, 2).map(({ citation }) => `[${citation.id}]`).join(" ")}`);
  }
  const leadSentence = sentence(lead);
  paragraphs.push(leadSentence);
  if (scope === "BROAD_PROFILE") return [...paragraphs, ...rest.map(sentence)].join("\n\n");
  const byLayer = new Map<string, EvidenceWithCitation[]>();
  for (const entry of rest) byLayer.set(layerGroup(entry.item), [...(byLayer.get(layerGroup(entry.item)) || []), entry]);
  for (const groupEntries of byLayer.values()) {
    paragraphs.push(groupEntries.map(sentence).join(" "));
  }
  return paragraphs.join("\n\n");
}
