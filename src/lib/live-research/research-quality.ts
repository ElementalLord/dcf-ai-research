import { normalizeForMatch } from "@/lib/corpus/text";
import { asksForPerformedWork, passageAddressesTarget, splitEvidenceSentences } from "@/lib/ask/target-support";
import { isBroadImportanceQuestion, isChangeImpactQuestion, isEnduringRelevanceQuestion } from "@/lib/ask/question-scope";
import { CONTEXT_FRAMING_TERMS, detectContextIntent } from "@/lib/ask/historical-context";
import { detectLens } from "@/lib/ask/lenses";

export type QueryIntent = "primary" | "scholarly" | "institutional" | "context" | "controversy" | "exact_work";
export type EvidenceType = "primary_document" | "traditional_text" | "scholarly_interpretation" | "institutional_record" | "edited_secondary" | "general_web";
export type PassageSupport = "EXACT" | "STRONG" | "PARTIAL" | "RELATED";
export type Accessibility = "READABLE" | "BIBLIOGRAPHIC_ONLY" | "UNREADABLE";

export type ResearchQuery = { query: string; intent: QueryIntent; reason: string };
export type SourceIdentity = {
  title: string | null;
  author: string | null;
  publisher: string | null;
  publicationDate: string | null;
  journal: string | null;
  doi: string | null;
  isbn: string | null;
  evidenceType: EvidenceType;
  workKey: string;
  provenanceComplete: boolean;
};

const STOP = new Set(["what", "which", "when", "where", "why", "how", "does", "did", "was", "were", "are", "the", "and", "for", "with", "from", "about", "into", "that", "this", "their", "his", "her", "him", "them", "he", "she", "they", "we", "work", "role", "known", "important", "significance", "angle", "lens", "perspective", "follow", "topic", "question", "find", "show", "tell", "give", "search", "look", "please", "hey", "actually", "really", "change", "changed", "transform", "transformed", "reshape", "reshaped", "could", "would", "should", "can", "you", "your", "explain", "describe", "more", "some", "people", ...CONTEXT_FRAMING_TERMS]);
const IDEA_QUESTION = /\b(?:ideas|beliefs|principles|values|visions?)\b.{0,100}\b(?:associated with|known for|did|does|hold|have|advocate|promote)\b/i;
const IDEA_EVIDENCE = /\b(?:idea|vision|belief|philosophy|principle|value|advocat|emphasiz|teach|promot|argu|aspir|thought|dream)\w*/i;
export const isBroadIdeaQuestion = (question: string) => IDEA_QUESTION.test(question);
export const isBroadSignificanceQuestion = (question: string) => isBroadImportanceQuestion(question) || /\b(?:significance|legacy)\b/i.test(question);
const SIGNIFICANCE_EVIDENCE = /\b(?:founded|established|created|built|developed|discovered|invented|pioneered|introduced|led|organized|organised|advocated|contributed|transformed|taught|guided|wrote|composed|published|translated)\b|\b(?:is|was|became)\b.{0,100}\b(?:founder|industrialist|reformer|scientist|artist|writer|poet|educator|teacher|composer|filmmaker|researcher|entrepreneur)\b/i;
const PRIORITY = /\b(?:first|earliest|priority|invented|discovered before|father of|pioneer(?:ed)?)\b/i;
const CONTEXT = /\b(?:at the time|context|period|contemporar|before|after|impact|significance|compare|versus|vs\.?|differ)\b/i;
const TEXTUAL = /\b(?:said|wrote|speech|letter|edicts?|inscriptions?|hymn|verse|chapter|mandala|kanda|teaching|primary source|original)\b/i;
const SCHOLARLY = /\b(?:attributed|authorship|disputed|historical|scholars?|evidence|scientific|technical|priority|impact|influence)\b/i;
const PURPOSE_QUESTION = /\b(?:what|which)\b.{0,100}\b(?:was|were|is|are)\s+for\b|\b(?:purpose|aim|intended to|why (?:did|does|was|were) .*?(?:create|write|issue|make))\b/i;
const PURPOSE_EVIDENCE = /\b(?:purpose|aim(?:ed)?|intended|meant|designed|in order to|so that|used (?:it|them|the|his|her)?\s*to|communicat\w*|promot\w*|instruct\w*|teach|convey\w*)\b/i;
export const isPurposeQuestion = (question: string) => PURPOSE_QUESTION.test(question);
export const hasPurposeEvidence = (text: string) => PURPOSE_EVIDENCE.test(text);

function clean(value: string): string {
  return value.replace(/[^\p{L}\p{N} .:'-]/gu, " ").replace(/\s+/g, " ").trim();
}

function focusTerms(question: string, personality: string): string[] {
  const names = new Set(normalizeForMatch(personality).split(" "));
  return [...new Set(normalizeForMatch(question).split(" ").filter((term) => term.length > 2 && !STOP.has(term) && !names.has(term)))].slice(0, 7);
}

/** A small, question-directed plan. It describes missing evidence classes instead of issuing a generic name search. */
export function planResearchQueries(personality: string, question: string, gaps: string[] = [], max = 2): ResearchQuery[] {
  const focus = focusTerms(question, personality);
  if (isEnduringRelevanceQuestion(question)) {
    for (const word of ["people", "still", "read", "study", "remember", "care", "today", "nowadays"]) {
      const index = focus.indexOf(word);
      if (index >= 0) focus.splice(index, 1);
    }
    focus.push("influence");
  }
  const lens = detectLens(question);
  if (lens) {
    const topic = [...new Set([...focus.filter((term) => !lens.ask.test(term)).slice(0, 2), ...lens.retrievalTerms.slice(0, 2)])].join(" ");
    return [{ query: clean(`${personality} ${topic}`), intent: "institutional",
      reason: "Find original sources that document the person's requested perspective." }];
  }
  if (isBroadSignificanceQuestion(question) && !focus.length) focus.push("contributions", "achievements", "biography");
  if (isChangeImpactQuestion(question) && focus.length)
    focus.push("impact", "contributions");
  if (isEnduringRelevanceQuestion(question) || isChangeImpactQuestion(question)) {
    return [{ query: clean(`${personality} ${[...new Set(focus)].slice(0, 6).join(" ")}`), intent: "scholarly",
      reason: "Find evidence of the work's influence in the area the user named." }];
  }
  if (!/\bknown for\b/i.test(question) && PURPOSE_QUESTION.test(question)) {
    return [{ query: clean(`${personality} ${focus.join(" ")} purpose aims message`), intent: "institutional",
      reason: "Find an explanation of the requested work's purpose, not only its existence or location." }];
  }
  if (asksForPerformedWork(question)) {
    return [{ query: clean(`${personality} ${focus.join(" ")} program repertoire works performed`), intent: "primary",
      reason: "Find a program or original account that names the work performed at the requested event." }];
  }
  if (detectContextIntent(question) === "contemporaries") {
    const topic = focus.join(" ") || "documented work";
    return [{ query: clean(`${personality} ${topic} peers contemporaries similar work`), intent: "context",
      reason: "The question asks who else worked on the same topic in the period." }];
  }
  if (isBroadIdeaQuestion(question)) focus.push("vision", "philosophy", "teachings");
  const gap = gaps.map(clean).filter((item) => item && !/^(?:evidence|direct evidence|general evidence)$/i.test(item)).slice(0, 2);
  const topic = [...new Set([...gap.flatMap((item) => item.split(" ")), ...focus])].slice(0, 10).join(" ") || "documented work";
  const plans: Array<{ intent: QueryIntent; suffix: string; reason: string }> = [];
  if (PRIORITY.test(question)) plans.push({ intent: "controversy", suffix: "history scholarly assessment chronology", reason: "The question makes a priority or first-use claim." });
  if (TEXTUAL.test(question)) plans.push({ intent: /["“”]/.test(question) ? "exact_work" : "primary", suffix: "original text archive edition", reason: "The question is best anchored in an identifiable primary work." });
  if (SCHOLARLY.test(question) || /compare|differ|how much|influence/i.test(question)) plans.push({ intent: "scholarly", suffix: "journal university scholarly history", reason: "The question needs independent interpretation or technical context." });
  if (CONTEXT.test(question)) plans.push({ intent: "context", suffix: "historical context contemporaries chronology", reason: "The question asks for period context or comparison." });
  if (!plans.length) plans.push({ intent: "institutional", suffix: "archive museum university", reason: "An institutional record is a proportionate starting point for this factual gap." });
  if (plans.length === 1 && gap.length > 1) plans.push({ intent: "scholarly", suffix: "scholarly assessment", reason: "A second evidence dimension remains uncovered." });
  const seen = new Set<string>();
  return plans.map((plan) => ({ ...plan, query: clean(`${personality} ${topic} ${plan.suffix}`) }))
    .filter((plan) => plan.query && !seen.has(plan.query) && seen.add(plan.query)).slice(0, Math.max(1, Math.min(2, max)));
}

export function evidenceTypeFor(input: { category?: string | null; sourceType?: string | null; textualLayer?: string | null }): EvidenceType {
  const value = `${input.category || ""} ${input.sourceType || ""} ${input.textualLayer || ""}`.toLowerCase();
  // Exact-URL approval is a human decision on a named, independently reviewed
  // publication. It is handled as a reference source, never as a domain-wide trust.
  if (/approved exact source/.test(value)) return "edited_secondary";
  if (/traditional|scripture|vedic|epic|primary.text/.test(value)) return /traditional|scripture|vedic|epic/.test(value) ? "traditional_text" : "primary_document";
  if (/primary|archive|speech|letter|inscription|proceedings/.test(value)) return "primary_document";
  if (/peer|journal|scholar|academic|university.press/.test(value)) return "scholarly_interpretation";
  if (/government|institution|museum|university|research.institute/.test(value)) return "institutional_record";
  if (/newspaper|magazine|reference|biograph|secondary/.test(value)) return "edited_secondary";
  return "general_web";
}

const normalizedWork = (value: string) => normalizeForMatch(value.replace(/\s+[|–—-]\s+(?:jstor|cambridge core|internet archive|google books|worldcat).*$/i, "")).replace(/\b(?:pdf|html|full text)\b/g, "").trim();
export function sourceWorkKey(input: { url: string; title?: string | null; author?: string | null; doi?: string | null; isbn?: string | null }): string {
  const doi = input.doi?.toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//, "").trim();
  if (doi) return `doi:${doi}`;
  const isbn = input.isbn?.replace(/[^0-9X]/gi, "").toUpperCase();
  if (isbn && isbn.length >= 10) return `isbn:${isbn}`;
  const title = normalizedWork(input.title || "");
  const author = normalizeForMatch(input.author || "").split(" ").at(-1) || "";
  if (title.split(" ").length >= 4 && title.length >= 24) return `work:${title}|${author}`;
  try {
    const url = new URL(input.url); return `page:${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/(?:index\.(?:html?|php)|full|pdf)\/?$/i, "/").replace(/\/$/, "")}`;
  } catch { return `page:${normalizeForMatch(input.url)}`; }
}

export function authenticateSource(input: { url: string; title?: string | null; author?: string | null; publisher?: string | null; publicationDate?: string | null; journal?: string | null; doi?: string | null; isbn?: string | null; category?: string | null; sourceType?: string | null; textualLayer?: string | null }): SourceIdentity {
  const evidenceType = evidenceTypeFor(input);
  const identity = {
    title: input.title?.trim() || null, author: input.author?.trim() || null, publisher: input.publisher?.trim() || null,
    publicationDate: input.publicationDate?.trim() || null, journal: input.journal?.trim() || null,
    doi: input.doi?.trim() || null, isbn: input.isbn?.trim() || null, evidenceType,
  };
  return { ...identity, workKey: sourceWorkKey({ url: input.url, title: identity.title, author: identity.author, doi: identity.doi, isbn: identity.isbn }),
    provenanceComplete: Boolean(identity.title && (identity.author || identity.publisher || identity.journal || identity.doi)) };
}

export function entityMatch(text: string, canonicalName: string, aliases: string[] = []): { matched: boolean; reason: string } {
  const normalized = ` ${normalizeForMatch(text)} `;
  const canonical = normalizeForMatch(canonicalName);
  const names = [...new Set([canonicalName, ...aliases].map(normalizeForMatch).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (normalized.includes(` ${canonical} `) || names.some((name) => name.includes(" ") && normalized.includes(` ${name} `))) return { matched: true, reason: "Full identity appears in the source passage." };
  const parts = canonical.split(" ");
  const surname = parts.at(-1) || canonical;
  const casedSurname = surname[0]?.toUpperCase() + surname.slice(1);
  // A lowercase word before a surname ("which Subbulakshmi", "about Bose")
  // is grammar, not a different person's given name.
  const conflicting = new RegExp(`\\b[A-Z][a-z]{2,}(?:\\s+[A-Z][a-z]{2,})?\\s+${casedSurname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text);
  if (conflicting) return { matched: false, reason: `The passage names a different person with the surname ${surname}.` };
  if (names.some((name) => !name.includes(" ") && normalized.includes(` ${name} `))) return { matched: true, reason: "A configured short-form identity appears without a conflicting full name." };
  return { matched: false, reason: "The selected person is not identified in the passage." };
}

export function assessPassageSupport(text: string, questionOrStatement: string, canonicalName: string, aliases: string[] = []): { level: PassageSupport; overlap: number; reason: string } {
  const entity = entityMatch(text, canonicalName, aliases);
  const names = new Set([canonicalName, ...aliases].flatMap((name) => normalizeForMatch(name).split(" ")));
  const terms = [...new Set(normalizeForMatch(questionOrStatement).split(" ").filter((term) => term.length >= 4 && !STOP.has(term) && !names.has(term)))];
  const normalized = normalizeForMatch(text);
  const hits = terms.filter((term) => normalized.includes(term) || (term.length > 6 && normalized.includes(term.replace(/(?:ing|ed|es|s)$/i, "")))).length;
  const overlap = terms.length ? hits / terms.length : 0;
  if (!entity.matched) return { level: "RELATED", overlap, reason: entity.reason };
  if (!passageAddressesTarget(questionOrStatement, text, [canonicalName, ...aliases])) return {
    level: hits ? "PARTIAL" : "RELATED", overlap,
    reason: "The passage does not establish the named target, event relationship, or requested date.",
  };
  if (asksForPerformedWork(questionOrStatement)) return { level: "STRONG", overlap,
    reason: "The passage names the performed work and connects it to the requested event." };
  if (isEnduringRelevanceQuestion(questionOrStatement)) {
    const lasting = /\b(?:inspir\w*|lasting|enduring|continu\w*|still|today|modern|generation\w*|legacy|remain\w*|relevant)\b|\binfluenc\w*\s+(?:on|over|later|subsequent|future)\b/i.test(text);
    const literaryTopic = /\b(?:poems?|poetry|poet)\b/i.test(questionOrStatement)
      ? /\b(?:poems?|poetry|poet)\b/i.test(text) : true;
    return { level: lasting && literaryTopic ? "STRONG" : "PARTIAL", overlap,
      reason: lasting && literaryTopic ? "The source identifies a continuing influence related to the requested work." : "The source does not establish why the work remains relevant." };
  }
  if (isChangeImpactQuestion(questionOrStatement)) {
    const effect = /\b(?:influenc\w*|inspir\w*|transform\w*|chang\w*|reshap\w*|introduc\w*|pioneer\w*|shift\w*|enabled?|opened?|advanced?|moderniz\w*)\b/i.test(text);
    const filmTopic = /\b(?:movies?|films?|cinema|filmmak\w*)\b/i.test(questionOrStatement)
      ? /\b(?:movies?|films?|cinema|filmmak\w*)\b/i.test(text) : true;
    return { level: effect && filmTopic ? "STRONG" : "PARTIAL", overlap,
      reason: effect && filmTopic ? "The source states an effect in the requested area." : "The source names a contribution without explaining what changed." };
  }
  if (PURPOSE_QUESTION.test(questionOrStatement) && hits >= 1 && PURPOSE_EVIDENCE.test(text)
    && !/\b(?:purpose|aim|intention)\s+(?:is|was)\s+(?:unknown|unclear|not known)\b/i.test(text))
    return { level: "STRONG", overlap, reason: "The source identifies the work and states a purpose or intended message." };
  if (isBroadIdeaQuestion(questionOrStatement) && IDEA_EVIDENCE.test(text) && text.trim().length >= 70)
    return { level: "STRONG", overlap, reason: "The passage identifies the person and states a documented idea or belief." };
  const lens = detectLens(questionOrStatement);
  // Naming an angle is not an answer to how it worked. A definition of
  // "administration" alone cannot explain someone's governing practice.
  const governanceQuestion = lens?.id === "administrative" && /\bhow\b.{0,120}\bgovern/i.test(questionOrStatement);
  const governanceDetail = /\b(?:council|minister|official|appoint|revenue|tax|justice|court|legal|law|land|fort|army|village|department|office|province|district|polic|collect|supervis|decentral|decree)\w*/i.test(text);
  if (governanceQuestion && !governanceDetail)
    return { level: "RELATED", overlap, reason: "The passage names administration but gives no governing practice or institution." };
  if (lens && splitEvidenceSentences(text).flatMap((sentence) => sentence.split(/;\s*/)).some((sentence) => sentence.trim().length >= 70
    && entityMatch(sentence, canonicalName, aliases).matched && lens.evidence.test(sentence)))
    return { level: "STRONG", overlap, reason: "The passage identifies the person and directly documents the requested perspective." };
  if (isBroadSignificanceQuestion(questionOrStatement) && splitEvidenceSentences(text).some((sentence) =>
    sentence.trim().length >= 70 && !/\b(?:read more|click here|copyright)\b|https?:\/\/|\b[a-z0-9-]+\.(?:com|org|net|in)\b/i.test(sentence)
      && entityMatch(sentence, canonicalName, aliases).matched && SIGNIFICANCE_EVIDENCE.test(sentence)))
    return { level: "STRONG", overlap, reason: "The passage identifies the person and describes a concrete role or contribution." };
  if (hits >= 3 && overlap >= 0.7) return { level: "EXACT", overlap, reason: "The passage identifies the person and directly covers nearly all material terms." };
  if (hits >= 2 && overlap >= 0.4) return { level: "STRONG", overlap, reason: "The passage identifies the person and directly covers the central topic." };
  if (hits >= 1) return { level: "PARTIAL", overlap, reason: "The passage supports only part of the requested point." };
  return { level: "RELATED", overlap, reason: "The passage identifies the person but does not substantively answer the question." };
}

export function independentWorkCount(items: Array<{ sourceId?: string | null; sourceUrl?: string | null; sourceTitle?: string | null; sourceAuthor?: string | null; workKey?: string | null }>): number {
  return new Set(items.map((item) => item.workKey
    || (item.sourceUrl ? sourceWorkKey({ url: item.sourceUrl, title: item.sourceTitle, author: item.sourceAuthor }) : null)
    || (item.sourceId ? `source:${item.sourceId}` : item.sourceTitle ? `title:${normalizedWork(item.sourceTitle)}` : null)).filter(Boolean)).size;
}
