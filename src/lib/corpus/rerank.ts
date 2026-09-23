import { CorpusError } from "./errors";
import { generateText, parseGeminiJson } from "./gemini";
import { truncateText } from "./text";
import type { RetrievedEvidence } from "./types";

function evidenceKey(item: RetrievedEvidence): string {
  return item.kind === "claim" ? `claim:${item.claimId}` : `passage:${item.chunkId}`;
}

export async function rerankEvidence(
  question: string,
  evidence: RetrievedEvidence[],
  maxSelected = 16,
): Promise<RetrievedEvidence[]> {
  if (evidence.length <= maxSelected) return evidence;
  const candidates = evidence.slice(0, 32);
  const prompt = `You are a retrieval reranker. Return JSON only as {"ids":["..."]}.
Rank evidence strictly by how directly it helps answer the question.
Do not add facts and do not answer the question.
Prefer source diversity and exact textual references. Exclude irrelevant evidence.
Return at most ${maxSelected} IDs chosen only from the records below.

QUESTION: ${question}

${candidates.map((item) => `ID ${evidenceKey(item)}\nTYPE ${item.kind}\n${truncateText(item.text, 850)}`).join("\n\n")}`;
  try {
    const { text } = await generateText(prompt, { timeoutMs: 25_000, errorCode: "RERANK_FAILED" });
    const parsed = parseGeminiJson<{ ids?: string[] }>(text);
    const byId = new Map(candidates.map((item) => [evidenceKey(item), item]));
    const selected = (parsed.ids || []).map((id) => byId.get(id)).filter((item): item is RetrievedEvidence => Boolean(item));
    return selected.length > 0 ? selected.slice(0, maxSelected) : candidates.slice(0, maxSelected);
  } catch (error) {
    if (error instanceof CorpusError) return candidates.slice(0, maxSelected);
    return candidates.slice(0, maxSelected);
  }
}
