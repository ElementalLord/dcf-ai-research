import { createHash } from "node:crypto";

const DIACRITICS = /[\u0300-\u036f]/g;

export function normalizeWhitespace(value: string): string {
  return value.replace(/\r\n?/g, "\n").replace(/[\t ]+/g, " ").trim();
}

export function normalizeForMatch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function hashText(value: string): string {
  return createHash("sha256").update(normalizeWhitespace(value)).digest("hex");
}

export function estimateTokens(value: string): number {
  if (!value.trim()) return 0;
  const words = value.trim().split(/\s+/).length;
  return Math.max(words, Math.ceil(value.length / 4));
}

export function truncateText(value: string, maxCharacters: number): string {
  if (value.length <= maxCharacters) return value;
  return `${value.slice(0, Math.max(0, maxCharacters - 1)).trimEnd()}…`;
}
