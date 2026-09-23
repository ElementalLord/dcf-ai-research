import type { Citation, RetrievedEvidence } from "./types";
import { evidenceBelongsToPersonality } from "./personality-config";

export type PersonalityEvidenceGroup = {
  personalityId: string;
  personalityName: string;
  evidence: RetrievedEvidence[];
};

export function mergePersonalityEvidence(groups: PersonalityEvidenceGroup[], limit = 16): RetrievedEvidence[] {
  const selected: RetrievedEvidence[] = [];
  const offsets = new Map(groups.map((group) => [group.personalityId, 0]));
  while (selected.length < limit) {
    let added = false;
    for (const group of groups) {
      const offset = offsets.get(group.personalityId) || 0;
      const item = group.evidence[offset];
      if (!item) continue;
      if (!evidenceBelongsToPersonality(group.personalityId, item.personalityId)) {
        throw new Error(`Evidence isolation failure for ${group.personalityName}.`);
      }
      selected.push(item);
      offsets.set(group.personalityId, offset + 1);
      added = true;
      if (selected.length >= limit) break;
    }
    if (!added) break;
  }
  return selected;
}

export function citationsMatchEvidence(citations: Citation[], evidence: RetrievedEvidence[]): boolean {
  if (citations.length !== evidence.length) return false;
  return citations.every((citation, index) => {
    const item = evidence[index];
    if (citation.personalityId !== item.personalityId) return false;
    if (item.kind === "passage") return citation.chunkId === item.chunkId && citation.sourceId === item.sourceId;
    return citation.claimId === item.claimId && (!item.chunkId || citation.chunkId === item.chunkId);
  });
}
