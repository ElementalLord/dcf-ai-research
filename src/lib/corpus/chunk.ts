import type { CorpusChunk, DocumentSection, JsonObject } from "./types";
import { estimateTokens, hashText, normalizeWhitespace } from "./text";

export type ChunkingOptions = {
  targetTokens?: number;
  maxTokens?: number;
  overlapTokens?: number;
};

const DEFAULTS: Required<ChunkingOptions> = {
  targetTokens: 900,
  maxTokens: 1200,
  overlapTokens: 125,
};

function splitLongBlock(block: string, maxTokens: number): string[] {
  if (estimateTokens(block) <= maxTokens) return [block];

  const units = block
    .split(/(?<=[.!?।॥])\s+|\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (units.length <= 1) {
    const words = block.split(/\s+/);
    const wordLimit = Math.max(50, Math.floor(maxTokens * 0.72));
    return Array.from(
      { length: Math.ceil(words.length / wordLimit) },
      (_, index) => words.slice(index * wordLimit, (index + 1) * wordLimit).join(" "),
    );
  }

  const result: string[] = [];
  let current = "";
  for (const unit of units) {
    const next = current ? `${current} ${unit}` : unit;
    if (current && estimateTokens(next) > maxTokens) {
      result.push(current);
      current = unit;
    } else {
      current = next;
    }
  }
  if (current) result.push(current);
  return result.flatMap((item) =>
    estimateTokens(item) > maxTokens ? splitLongBlock(item, maxTokens) : [item],
  );
}

function paragraphBlocks(text: string, maxTokens: number): string[] {
  return normalizeWhitespace(text)
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .flatMap((block) => splitLongBlock(block, maxTokens));
}

function overlapBlocks(blocks: string[], overlapTokens: number): string[] {
  const overlap: string[] = [];
  let tokens = 0;
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const blockTokens = estimateTokens(blocks[index]);
    if (overlap.length > 0 && tokens + blockTokens > overlapTokens) break;
    overlap.unshift(blocks[index]);
    tokens += blockTokens;
    if (tokens >= overlapTokens) break;
  }
  return overlap;
}

export function chunkSections(
  sections: DocumentSection[],
  options: ChunkingOptions = {},
): CorpusChunk[] {
  const config = { ...DEFAULTS, ...options };
  if (config.targetTokens <= config.overlapTokens) {
    throw new Error("targetTokens must be greater than overlapTokens");
  }
  if (config.maxTokens < config.targetTokens) {
    throw new Error("maxTokens must be greater than or equal to targetTokens");
  }

  const chunks: CorpusChunk[] = [];
  let documentOffset = 0;

  for (const section of sections) {
    const cleanText = normalizeWhitespace(section.text);
    if (!cleanText) continue;
    const blocks = paragraphBlocks(cleanText, config.maxTokens);
    let current: string[] = [];

    const emit = () => {
      const text = current.join("\n\n").trim();
      if (!text) return;
      const localStart = cleanText.indexOf(current[0]);
      const metadata: JsonObject = { ...(section.metadata || {}) };
      chunks.push({
        chunkIndex: chunks.length,
        text,
        sectionTitle: section.title?.trim() || null,
        pageOrSection: section.pageOrSection?.trim() || null,
        startOffset: localStart >= 0 ? documentOffset + localStart : null,
        endOffset: localStart >= 0 ? documentOffset + localStart + text.length : null,
        tokenEstimate: estimateTokens(text),
        contentHash: hashText(text),
        metadata,
      });
    };

    for (const block of blocks) {
      const next = [...current, block].join("\n\n");
      if (current.length > 0 && estimateTokens(next) > config.targetTokens) {
        emit();
        current = [...overlapBlocks(current, config.overlapTokens), block];
        while (estimateTokens(current.join("\n\n")) > config.maxTokens && current.length > 1) {
          current.shift();
        }
      } else {
        current.push(block);
      }
    }
    emit();
    documentOffset += cleanText.length + 2;
  }

  return chunks;
}

export function dedupeChunksByHash(chunks: CorpusChunk[]): CorpusChunk[] {
  const seen = new Set<string>();
  return chunks.filter((chunk) => {
    if (seen.has(chunk.contentHash)) return false;
    seen.add(chunk.contentHash);
    return true;
  }).map((chunk, chunkIndex) => ({ ...chunk, chunkIndex }));
}
