import type { Citation, RetrievedEvidence } from "./types";
import { truncateText } from "./text";

export const DEFAULT_MAX_EVIDENCE = 16;
export const DEFAULT_MAX_CONTEXT_CHARACTERS = 48_000;

export function buildBoundedContext(
  evidence: RetrievedEvidence[],
  maxEvidence = DEFAULT_MAX_EVIDENCE,
  maxCharacters = DEFAULT_MAX_CONTEXT_CHARACTERS,
): { context: string; citations: Citation[]; selected: RetrievedEvidence[] } {
  const records: string[] = [];
  const citations: Citation[] = [];
  const selected: RetrievedEvidence[] = [];
  let characters = 0;
  let claimIndex = 0;
  let sourceIndex = 0;

  for (const item of evidence.slice(0, maxEvidence)) {
    const citationId = item.kind === "claim" ? `C${++claimIndex}` : `S${++sourceIndex}`;
    const body = truncateText(item.text, 4_500);
    const record = item.kind === "claim"
      ? `[${citationId}] HUMAN-APPROVED CLAIM\nType: ${item.claimKind}\nCertainty: ${item.certainty}\nTextual layer: ${item.textualLayer || "not specified"}\nClaim: ${body}\nSource: ${item.sourceTitle || "not linked"}\nLocation: ${item.pageOrSection || "not specified"}`
      : `[${citationId}] DIRECT PASSAGE FROM AN APPROVED SOURCE\nSource type: ${item.sourceType || "not specified"}\nTextual layer: ${item.textualLayer || "not specified"}\nSource: ${item.sourceTitle}\nLocation: ${item.pageOrSection || item.sectionTitle || "not specified"}\nPassage: ${body}`;

    if (records.length > 0 && characters + record.length > maxCharacters) break;
    records.push(record);
    characters += record.length;
    selected.push(item);
    citations.push({
      id: citationId,
      kind: item.kind === "claim" ? "approved_claim" : "approved_source_passage",
      claimId: item.kind === "claim" ? item.claimId : undefined,
      chunkId: item.kind === "passage" ? item.chunkId : item.chunkId || undefined,
      sourceId: item.kind === "passage" ? item.sourceId : undefined,
      title: item.sourceTitle || (item.kind === "claim" ? "Approved claim" : "Source passage"),
      author: item.sourceAuthor,
      institution: item.sourceInstitution,
      url: item.sourceUrl,
      pageOrSection: item.pageOrSection,
      textualLayer: item.textualLayer,
      retrievedAt: item.kind === "passage" ? item.retrievedAt : null,
      excerpt: body,
    });
  }

  return { context: records.join("\n\n"), citations, selected };
}
