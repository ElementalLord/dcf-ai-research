import { isBroadSynthesisQuestion, isSubjectiveSuperlativeQuestion } from "@/lib/corpus/routing";

export const MAX_CONVERSATION_QUESTIONS = 4;

export type ConversationQuestion = {
  question: string;
  resolvedQuestion?: string;
};

export type ResolvedQuestionContext = {
  originalQuestion: string;
  resolvedQuestion: string;
  subjects: string[];
  broadSynthesis: boolean;
  subjectiveSuperlative: boolean;
};

const QUESTION_WORDS = new Set([
  "A", "An", "And", "Are", "Can", "Could", "Did", "Do", "Does", "Explain",
  "How", "If", "In", "Is", "Tell", "The", "Then", "What", "When", "Where",
  "Which", "Who", "Why", "Would",
]);

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
  const recentNames = unique(
    recentHistory
      .slice()
      .reverse()
      .flatMap((turn) => namesMentioned(turn.resolvedQuestion || turn.question))
      .filter((name) => !selected.some((personality) => personality.toLocaleLowerCase() === name.toLocaleLowerCase())),
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
  const pluralSubject = pluralSubjects.length > 1 ? pluralSubjects.join(" and ") : null;
  const rewritten = replaceReferences(question.trim(), singularSubject, pluralSubject);
  const needsContextPrefix = rewritten === question.trim() && selected.length > 0;
  const resolvedQuestion = needsContextPrefix
    ? `${selected.length === 1 ? "Selected personality" : "Selected comparison set"}: ${selected.join(" and ")}. ${rewritten}`
    : rewritten;

  return {
    originalQuestion: question.trim(),
    resolvedQuestion,
    subjects: unique([...selected, ...recentNames.slice(0, 1)]),
    broadSynthesis: isBroadSynthesisQuestion(resolvedQuestion),
    subjectiveSuperlative: isSubjectiveSuperlativeQuestion(resolvedQuestion),
  };
}
