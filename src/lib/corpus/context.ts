import type { Citation, RetrievedEvidence } from "./types";
import { truncateText } from "./text";

export const DEFAULT_MAX_EVIDENCE = 15;
export const DEFAULT_MAX_CONTEXT_CHARACTERS = 32_000;

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
    const body = truncateText(item.text, item.kind === "passage" ? 2_400 : 1_100);
    const record = item.kind === "claim"
      ? `[${citationId}] APPROVED CLAIM\nPersonality: ${item.personalityName || "unspecified"}\nTopic: ${item.parameterName || item.fieldLabel || "unclassified"}\nEvidence type: ${item.evidenceType}; approval: ${item.approvalOrigin}; certainty: ${item.certainty}\nSource: ${item.sourceTitle || "not linked"}; source type: ${item.sourceType || "unspecified"}\nTextual layer: ${item.textualLayer || "unspecified"}; location: ${item.pageOrSection || "unspecified"}\nClaim: ${body}`
      : `[${citationId}] APPROVED SOURCE PASSAGE\nPersonality: ${item.personalityName || "unspecified"}\nTopic: ${item.parameterNames?.join(", ") || "source passage"}\nSource: ${item.sourceTitle}; source type: ${item.sourceType || "unspecified"}\nTextual layer: ${item.textualLayer || "unspecified"}; location: ${item.pageOrSection || item.sectionTitle || "unspecified"}\nOriginal URL: ${item.sourceUrl || "unavailable"}\nPassage: ${body}`;

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
      sourceType: item.kind === "passage" ? item.sourceType : item.sourceType,
      pageOrSection: item.pageOrSection,
      textualLayer: item.textualLayer,
      retrievedAt: item.kind === "passage" ? item.retrievedAt : null,
      excerpt: body,
      personalityId: item.personalityId,
      personalityName: item.personalityName,
      approvalOrigin: item.kind === "claim" ? item.approvalOrigin : undefined,
      evidenceType: item.kind === "claim" ? item.evidenceType : undefined,
    });
  }

  return { context: records.join("\n\n"), citations, selected };
}
