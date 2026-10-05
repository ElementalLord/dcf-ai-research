import type { Citation, RetrievedEvidence } from "./types";
import { truncateText } from "./text";

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
  const claimPropositions = new Set<string>();

  for (const item of evidence) {
    if (selected.length >= maxEvidence) break;
    const topic = item.kind === "claim" ? item.parameterCode || item.parameterName || "" : item.parameterNames?.join("|") || "";
    const normalized = item.text.normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const key = `${item.personalityId || ""}:${item.kind}:${normalized}`;
    if (seen.has(key)) continue;
    // A claim is already a concise proposition. Repeated copies under different parameters
    // spend context without giving the model another independent reason to believe it.
    if (item.kind === "claim" && claimPropositions.has(normalized)) continue;
    seen.add(key);
    if (item.kind === "claim") claimPropositions.add(normalized);
    const citationId = item.kind === "claim" ? `C${++claimIndex}` : `S${++sourceIndex}`;
    const body = truncateText(item.text, item.kind === "passage" ? 380 : 450);
    const location = item.pageOrSection || (item.kind === "passage" ? item.sectionTitle : null) || "location unspecified";
    const metadata = `${item.personalityName ? `Personality: ${item.personalityName}\n` : ""}Work: ${item.sourceTitle || "not linked"}; locator: ${location}; layer: ${item.textualLayer || "unspecified"}; source type: ${item.sourceType || "unspecified"}`;
    const record = item.kind === "claim"
      ? `[${citationId}] Claim / topic: ${item.parameterName || item.fieldLabel || topic || "unclassified"}\nProposition: ${body}\n${metadata}\nEpistemic: ${item.epistemicType || "unclassified"}; evidence: ${item.evidenceType}; support: ${item.contractStatus || "not classified"}; certainty: ${item.certainty || "unspecified"}; contested: ${item.epistemicType === "CONTESTED" || item.contractStatus === "CONTESTED_REPRESENTED" ? "yes" : "not marked"}${item.evidenceExcerpt ? `\nSupporting passage: ${truncateText(item.evidenceExcerpt, 170)}` : ""}`
      : `[${citationId}] Supporting passage / topic: ${item.parameterNames?.join(", ") || "source passage"}\n${metadata}\nPassage: ${body}`;

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
