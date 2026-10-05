import type { Citation, RetrievedEvidence } from "./types";
import { truncateText } from "./text";
import { packetTag } from "@/lib/claim-epistemics/language";

export const DEFAULT_MAX_EVIDENCE = 15;
export const DEFAULT_MAX_CONTEXT_CHARACTERS = 16_000;

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
  const seen = new Set<string>();

  for (const item of evidence) {
    if (selected.length >= maxEvidence) break;
    const topic = item.kind === "claim" ? item.parameterCode || item.parameterName || "" : item.parameterNames?.join("|") || "";
    const key = `${item.personalityId || ""}:${item.kind}:${topic}:${item.text.normalize("NFKD").toLowerCase().replace(/\s+/g, " ").trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const citationId = item.kind === "claim" ? `C${++claimIndex}` : `S${++sourceIndex}`;
    const body = truncateText(item.text, item.kind === "passage" ? 1_100 : 650);
    const record = item.kind === "claim"
      ? `[${citationId}] CLAIM · ${item.parameterName || item.fieldLabel || "unclassified"} · ${packetTag(item) || item.evidenceType}\n${item.personalityName ? `Personality: ${item.personalityName}\n` : ""}Source: ${item.sourceTitle || "not linked"}; ${item.textualLayer || "layer unspecified"}; ${item.pageOrSection || "location unspecified"}\n${body}`
      : `[${citationId}] PASSAGE · ${item.parameterNames?.join(", ") || "source passage"}\n${item.personalityName ? `Personality: ${item.personalityName}\n` : ""}Source: ${item.sourceTitle}; ${item.textualLayer || "layer unspecified"}; ${item.pageOrSection || item.sectionTitle || "location unspecified"}\n${body}`;

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
      epistemicType: item.kind === "claim" ? item.epistemicType ?? null : undefined,
      contractStatus: item.kind === "claim" ? item.contractStatus ?? null : undefined,
    });
  }

  return { context: records.join("\n\n"), citations, selected };
}
