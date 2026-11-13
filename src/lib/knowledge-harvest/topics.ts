import { createHash } from "node:crypto";
import { normalizeForMatch } from "@/lib/corpus/text";

const STOP = new Set(["what", "which", "when", "where", "why", "how", "who", "whom", "whose", "does", "did", "was", "were", "are", "been",
  "being", "have", "has", "had", "the", "and", "for", "with", "from", "about", "into", "that", "this", "these", "those", "their", "there",
  "they", "them", "then", "than", "his", "her", "him", "she", "its", "also", "such", "some", "more", "most", "many", "much", "very",
  "after", "before", "during", "while", "through", "between", "under", "over", "upon", "would", "could", "should", "will", "shall",
  "may", "might", "must", "can", "not", "but", "one", "two", "first", "known", "important", "called", "became", "become", "made",
  "make", "said", "tell", "show", "give", "find", "explain", "describe", "please", "people", "person", "thing", "things", "year",
  "years", "time", "times", "work", "works", "life", "role", "part", "other", "others", "each", "both", "only", "even", "still",
  "selected", "personality", "question", "topic", "source", "sources", "according"]);

/** Light, deterministic stemming so a stored passage and a later question meet on the same term. */
export function topicStem(term: string): string {
  if (term.length <= 5) return term;
  return term.replace(/(?:ations?|ments?|ings?|ies|ed|es|s)$/i, (suffix) => suffix === "ies" ? "y" : "") || term;
}

/**
 * The distinct content words of a question or passage, without the subject's own name.
 * These are an index for finding a page again; they are not prose and cannot
 * reconstruct the passage.
 */
export function topicTerms(text: string, subjectNames: string[] = [], max = 24): string[] {
  const nameWords = new Set(subjectNames.flatMap((name) => normalizeForMatch(name).split(" ")).filter(Boolean));
  const terms: string[] = [];
  const seen = new Set<string>();
  for (const word of normalizeForMatch(text).split(" ")) {
    if (word.length < 4 && !/^\d{4}$/.test(word)) continue;
    if (STOP.has(word) || nameWords.has(word)) continue;
    const stem = topicStem(word);
    if (stem.length < 3 || seen.has(stem)) continue;
    seen.add(stem);
    terms.push(stem.slice(0, 40));
    if (terms.length >= max) break;
  }
  return terms;
}

/** Stable identity for "the same question about the same person", with no question text. */
export function questionFingerprint(personalityId: string, question: string, subjectNames: string[] = []): string {
  const terms = topicTerms(question, subjectNames, 16).sort();
  return createHash("sha256").update(`harvest-question/v1:${personalityId}:${terms.join(" ")}`).digest("hex").slice(0, 40);
}

export function passageHash(text: string): string {
  return createHash("sha256").update(normalizeForMatch(text)).digest("hex");
}
