import { isBroadSynthesisQuestion, isSubjectiveSuperlativeQuestion } from "@/lib/corpus/routing";
import { classifyQuestionScope, type QuestionScope } from "./question-scope";

export const MAX_CONVERSATION_QUESTIONS = 4;

export type ConversationQuestion = {
  question: string;
  resolvedQuestion?: string;
  answer?: string;
  citedConcepts?: string[];
};

export type ResolvedQuestionContext = {
  originalQuestion: string;
  resolvedQuestion: string;
  subjects: string[];
  broadSynthesis: boolean;
  subjectiveSuperlative: boolean;
  scope: QuestionScope;
  depthFollowup: boolean;
};

const QUESTION_WORDS = new Set([
  "A", "An", "And", "Are", "Can", "Could", "Did", "Do", "Does", "Explain",
  "How", "If", "In", "Is", "Tell", "The", "Then", "What", "When", "Where",
  "Which", "Who", "Why", "Would",
]);

const EXPANSION_WORDS = new Set(["more", "further", "deeper", "depth", "detail", "details", "elaborate", "expand", "explain", "clarify", "context", "continue"]);
const CONTINUATION_FILLER = new Set(["a", "an", "the", "this", "that", "it", "its", "these", "those", "previous", "last", "same",
  "answer", "response", "point", "topic", "about", "on", "in", "into", "of", "to", "for", "with", "from", "bit", "little",
  "can", "could", "would", "will", "you", "your", "me", "we", "please", "what", "say", "said", "tell", "give", "provide", "go", "break", "down"]);

/** Correct adjacent-letter slips in intent words without binding follow-ups to a particular typo. */
function expansionWord(value: string): string | null {
  if (EXPANSION_WORDS.has(value)) return value;
  for (const word of EXPANSION_WORDS) {
    if (value.length !== word.length) continue;
    for (let index = 0; index < word.length - 1; index += 1) {
      if (value === word.slice(0, index) + word[index + 1] + word[index] + word.slice(index + 2)) return word;
    }
  }
  return null;
}

function asksToExpandPreviousAnswer(question: string, selected: string[]): boolean {
  const words = question.toLowerCase().match(/\p{L}+/gu) || [];
  const selectedWords = new Set(selected.flatMap((name) => name.toLowerCase().match(/\p{L}+/gu) || []));
  const hasExpansion = words.some(expansionWord);
  const hasReference = words.some((word) => ["this", "that", "it", "these", "those", "previous", "last", "same", "answer", "response"].includes(word));
  const hasNewTopic = words.some((word) => !expansionWord(word) && !CONTINUATION_FILLER.has(word) && !selectedWords.has(word));
  const asksForMore = words.some((word) => {
    const intent = expansionWord(word);
    return Boolean(intent && !["explain", "clarify", "context"].includes(intent));
  });
  return hasExpansion && !hasNewTopic && (hasReference || asksForMore || words.length <= 2);
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function namesMentioned(value: string): string[] {
  const matches = value.match(/\b\p{Lu}\p{Ll}+(?:\s+\p{Lu}\p{Ll}+)*\b/gu) || [];
  return unique(matches.filter((match) => !QUESTION_WORDS.has(match)));
}

function possessive(name: string): string {
  return `${name}${/s$/i.test(name) ? "'" : "'s"}`;
}

function rewriteOutsideQuotes(value: string, rewrite: (segment: string) => string): string {
  return value
    .split(/((?:"[^"\n]*"|'[^'\n]*'|“[^”\n]*”|‘[^’\n]*’))/g)
    .map((segment, index) => (index % 2 === 1 ? segment : rewrite(segment)))
    .join("");
}

function replaceReferences(value: string, singularSubject: string | null, pluralSubject: string | null): string {
  return rewriteOutsideQuotes(value, (segment) => {
    let resolved = segment;
    if (singularSubject) {
      const owner = possessive(singularSubject);
      resolved = resolved
        .replace(/\b(?:this|the)\s+(?:selected\s+)?(?:personality|person|figure|guy|man|woman|sage)\b/gi, singularSubject)
        .replace(/\b(?:his|hers)\b/gi, owner)
        .replace(/\bher\b(?=\s+(?:teacher|student|rival|life|work|role|text|texts|contribution|contributions|family|relationship|legacy|story|ideas?)\b)/gi, owner)
        .replace(/\b(?:he|him|she|her|himself|herself)\b/gi, singularSubject);
    }
    if (pluralSubject) {
      const owner = possessive(pluralSubject);
      resolved = resolved
        .replace(/\btheir\b/gi, owner)
        .replace(/\b(?:they|them|themselves)\b/gi, pluralSubject);
    }
    return resolved;
  });
}

export function resolveQuestionContext(
  question: string,
  selectedPersonalities: string[],
  history: ConversationQuestion[] = [],
): ResolvedQuestionContext {
  const selected = unique(selectedPersonalities);
  const recentHistory = history.slice(-MAX_CONVERSATION_QUESTIONS);
  const previous = recentHistory.at(-1);
  const depthFollowup = Boolean(previous && asksToExpandPreviousAnswer(question, selected));
  const previousAnswer = previous?.answer?.replace(/\[[CS]\d+\]/g, "").replace(/\s+/g, " ").slice(0, 800) || "";
  const namedConcept = [...previousAnswer.matchAll(/\b(?:[A-Z][\p{L}.]*\s+){1,3}(?:[Ee]ffect|[Dd]iscovery|[Ee]xperiment|[Cc]onflict|[Ss]peech|[Tt]heory)\b/gu)][0]?.[0]
    || previous?.citedConcepts?.find((concept) => /effect|discovery|experiment|conflict|battle|speech|theory/i.test(concept));
  const recentNames = unique(
    recentHistory
      .slice()
      .reverse()
      .flatMap((turn) => namesMentioned(turn.resolvedQuestion || turn.question))
      .filter((name) => !/^(?:Selected|Personality|Comparison|Context|Earlier|Raman Effect)$/i.test(name))
      .filter((name) => !selected.some((personality) => {
        const normalizedName = name.toLocaleLowerCase();
        const selectedWords: string[] = personality.toLocaleLowerCase().match(/\p{L}+/gu) || [];
        return personality.toLocaleLowerCase() === normalizedName || selectedWords.includes(normalizedName);
      })),
  );
  const citedLead = previous?.citedConcepts?.find((title) =>
    selected.some((name) => title.toLowerCase().includes(name.toLowerCase()))
    && recentNames.some((name) => title.toLowerCase().includes(name.toLowerCase())),
  );

  let singularSubject: string | null = selected.length === 1 ? selected[0] : null;
  if (selected.length > 1) {
    const explicitlyMentioned = selected.filter((name) =>
      new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(question),
    );
    singularSubject = explicitlyMentioned.length === 1 ? explicitlyMentioned[0] : null;
  }

  const pluralSubjects = selected.length > 1
    ? selected
    : selected.length === 1 && recentNames.length > 0
      ? [selected[0], recentNames[0]]
      : [];
  const pluralSubject = pluralSubjects.length > 1 ? pluralSubjects.join(" and ") : singularSubject;
  const rewritten = replaceReferences(question.trim(), singularSubject, pluralSubject);
  // A request for depth refers to the preceding topic. Keep that topic as the
  // factual question so search and passage validation do not look for words
  // such as a pronoun, a spelling slip, or "follow-up" in original sources.
  let resolvedQuestion = depthFollowup ? (previous?.resolvedQuestion || previous?.question || rewritten).slice(0, 500) : rewritten;
  const referential = /\b(?:that|this|those|it|they|them|their|he|she|similar|same|next|earlier|later|at the time)\b/i.test(question);
  if (previous && referential && !depthFollowup) {
    if (namedConcept) {
      resolvedQuestion = resolvedQuestion
        .replace(/\b(?:that|this|the)\s+(?:discovery|effect|conflict|event|work)\b/gi, namedConcept)
        .replace(/\b(?:something|anything)\s+similar\b/gi, `work similar to ${namedConcept}`)
        .replace(/\b(?:that|this|it)\b(?=\s+(?:important|significant|matter|a big deal)\b)/gi, namedConcept);
      if (!resolvedQuestion.toLocaleLowerCase().includes(namedConcept.toLocaleLowerCase()) && /\b(?:similar|same|at the time|next)\b/i.test(question))
        resolvedQuestion += ` Related topic: ${namedConcept}.`;
    } else if (rewritten === question.trim() && /\b(?:that|this|it|similar|same|next|at the time)\b/i.test(question)) {
      resolvedQuestion += ` Follow-up to: ${(previous.resolvedQuestion || previous.question).slice(0, 160)}.`;
    }
    if (citedLead && /\b(?:they|them|their|enemies|rivals)\b/i.test(question)) resolvedQuestion += ` Earlier cited topic: ${citedLead.slice(0, 120)}.`;
  }
  if (selected.length && !selected.some((name) => resolvedQuestion.toLocaleLowerCase().includes(name.toLocaleLowerCase())))
    resolvedQuestion += ` About ${selected.join(" and ")}.`;

  return {
    originalQuestion: question.trim(),
    resolvedQuestion,
    subjects: unique([...selected, ...recentNames.slice(0, 1)]),
    broadSynthesis: isBroadSynthesisQuestion(resolvedQuestion),
    subjectiveSuperlative: isSubjectiveSuperlativeQuestion(resolvedQuestion),
    scope: classifyQuestionScope(resolvedQuestion),
    depthFollowup,
  };
}
