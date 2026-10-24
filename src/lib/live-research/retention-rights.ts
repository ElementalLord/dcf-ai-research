/** Matches only rights declarations accepted by the demand admission RPC. */
export function hasExplicitRetentionRights(value: string | null | undefined): boolean {
  if (!value || /\b(?:not|no|without)\s+(?:in\s+the\s+)?public domain\b/i.test(value)) return false;
  return /\bpublic domain\b|\bcc0\b|creativecommons\.org\/(?:licenses|publicdomain)\//i.test(value);
}
