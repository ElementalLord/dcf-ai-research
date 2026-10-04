import { normalizeForMatch } from "./text";

export type AliasRecord = {
  alias: string;
  aliasType?: string | null;
  confidence?: number | null;
  isAmbiguous?: boolean | null;
};

export type TermAliasRecord = {
  canonicalTerm: string;
  alias: string;
};

export type RoutingParameter = {
  code: string;
  routingHints?: string[] | null;
};

export type PersonalityConfiguration = {
  personalityId: string;
  canonicalName: string;
  categoryId: string;
  categorySlug: string | null;
  categoryName: string | null;
  aliases: AliasRecord[];
  termAliases: TermAliasRecord[];
};

export function normalizedAliases(canonicalName: string, aliases: AliasRecord[]): string[] {
  return [...new Set([canonicalName, ...aliases.filter((item) => !item.isAmbiguous || (item.confidence || 0) >= 0.8).map((item) => item.alias)]
    .map(normalizeForMatch)
    .filter(Boolean))];
}

export function canonicalizeTerms(value: string, aliases: TermAliasRecord[]): string {
  let normalized = normalizeForMatch(value);
  const ordered = [...aliases].sort((left, right) => right.alias.length - left.alias.length);
  for (const item of ordered) {
    const alias = normalizeForMatch(item.alias);
    const canonical = normalizeForMatch(item.canonicalTerm);
    if (!alias || !canonical) continue;
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    normalized = normalized.replace(new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, "g"), `$1${canonical}`);
  }
  return normalized;
}

export function selectPrimaryCategory<T extends { is_primary?: boolean | null; category_id: string }>(memberships: T[]): T | null {
  return memberships.find((membership) => membership.is_primary) || memberships[0] || null;
}

export function evidenceBelongsToPersonality(
  requestedPersonalityId: string,
  evidencePersonalityId: string | null | undefined,
): boolean {
  return evidencePersonalityId === requestedPersonalityId;
}

/** Rewrite known database aliases while preserving punctuation, references and quotes. */
export function canonicalizeQuestion(value: string, aliases: TermAliasRecord[]): string {
  const ascii = (text: string) => text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  return value.split(/("[^"\n]*"|“[^”\n]*”)/g).map((segment, index) => {
    if (index % 2) return segment;
    let rewritten = ascii(segment);
    for (const item of [...aliases].sort((a, b) => b.alias.length - a.alias.length)) {
      const alias = ascii(item.alias).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (alias) rewritten = rewritten.replace(new RegExp(`(?<![\\p{L}\\p{N}])${alias}(?![\\p{L}\\p{N}])`, "giu"), item.canonicalTerm);
    }
    return rewritten;
  }).join("");
}
