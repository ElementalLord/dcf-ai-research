/** Matches only rights declarations accepted by the demand admission RPC. */
export function hasExplicitRetentionRights(value: string | null | undefined): boolean {
  if (!value || /\b(?:not|no|without)\b.{0,50}(?:\bpublic domain\b|\bcc0\b|creativecommons\.org)/i.test(value)) return false;
  if (/\bpublic domain\b|\bcc0(?:\s+1\.0)?\b/i.test(value)) return true;
  return /(?:^|\s)https:\/\/creativecommons\.org\/(?:licenses\/(?:by|by-sa|by-nc|by-nc-sa|by-nd|by-nc-nd)\/[1-4]\.0|publicdomain\/(?:zero|mark)\/1\.0)\/?(?:\s|$)/i.test(value);
}

/** A publisher may use HTTP in an article-specific Creative Commons link. */
export function canonicalRetentionRights(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.trim().match(/^https?:\/\/creativecommons\.org\/(?:licenses\/(?:by|by-sa|by-nc|by-nc-sa|by-nd|by-nc-nd)\/[1-4]\.0|publicdomain\/(?:zero|mark)\/1\.0)\/?$/i);
  if (!match) return value;
  return `https://${match[0].replace(/^https?:\/\//i, "")}`;
}
