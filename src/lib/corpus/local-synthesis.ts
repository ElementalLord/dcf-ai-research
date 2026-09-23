import type { ResolvedQuestionContext } from "@/lib/ask/query-context";
import type { Citation, RetrievedEvidence } from "./types";
import { normalizeWhitespace, truncateText } from "./text";

export function aiSynthesisEnabled(value = process.env.AI_SYNTHESIS_MODE): boolean {
  return value === "gemini";
}

function isFrameworkRecord(item: RetrievedEvidence): boolean {
  return /parameters to study|research framework/i.test(`${item.sourceTitle || ""} ${item.textualLayer || ""}`);
}

function evidenceLine(item: RetrievedEvidence, citationId: string): string {
  if (item.kind === "claim") return `- ${normalizeWhitespace(item.text)} [${citationId}]`;
  const location = item.pageOrSection ? `, ${item.pageOrSection}` : "";
  return `- ${item.sourceTitle}${location}: ${truncateText(normalizeWhitespace(item.text), 320)} [${citationId}]`;
}

export function synthesizeFromLocalEvidence(
  personality: string,
  selected: RetrievedEvidence[],
  citations: Citation[],
  context: Pick<ResolvedQuestionContext, "broadSynthesis" | "subjectiveSuperlative">,
): string {
  const paired = selected.map((item, index) => ({ item, citation: citations[index] })).filter((entry) => Boolean(entry.citation));
  const claims = paired.filter((entry) => entry.item.kind === "claim" && !isFrameworkRecord(entry.item));
  const frameworkClaims = paired.filter((entry) => entry.item.kind === "claim" && isFrameworkRecord(entry.item));
  const passages = paired.filter((entry) => entry.item.kind === "passage" && !isFrameworkRecord(entry.item));
  const ordered = context.broadSynthesis
    ? [...claims, ...passages, ...frameworkClaims]
    : paired;
  const unique = ordered.filter((entry, index, all) =>
    all.findIndex((candidate) => normalizeWhitespace(candidate.item.text) === normalizeWhitespace(entry.item.text)) === index,
  );
  const chosen = unique.slice(0, context.broadSynthesis ? 4 : 5);

  const introduction = context.subjectiveSuperlative
    ? `The approved local corpus does not establish one objectively “biggest” contribution for ${personality}. The strongest documented areas in the available evidence are:`
    : context.broadSynthesis
      ? `Here is a concise profile of ${personality} from the approved local corpus:`
      : `The approved local corpus supports the following answer about ${personality}:`;

  return `${introduction}\n\n${chosen.map(({ item, citation }) => evidenceLine(item, citation.id)).join("\n\n")}`;
}
