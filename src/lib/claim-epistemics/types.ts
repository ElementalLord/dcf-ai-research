/**
 * Claim epistemics: WHAT a claim asserts (its epistemic type) is separate from WHERE its evidence comes from
 * (the source's epistemic class) and from HOW a passage supports it (EXACT/STRONG/PARTIAL/RELATED).
 * An evidence contract combines the three into a claim-level judgement.
 */

export const CLASSIFIER_VERSION = "epistemic-classifier/1";
export const CONTRACT_VERSION = "evidence-contracts/1";
export const DEPTH_VERSION = "depth/2-type-aware";

/** What the claim asserts. Compact and extensible; subject facets (lineage, relations, doctrine) are not types. */
export const EPISTEMIC_TYPES = [
  "TEXTUAL_ASSERTION",        // what a text says, names, attributes, or contains
  "TRADITIONAL_NARRATIVE",    // what a narrative tradition narrates (not that it happened)
  "HISTORICAL_FACT",          // what actually happened or existed
  "HISTORICAL_INFERENCE",     // what the evidence suggests about history, explicitly inferential
  "SCHOLARLY_ATTRIBUTION",    // that a named scholar or work argues/states something
  "SCHOLARLY_INTERPRETATION", // an interpretation drawn from scholarship, stated as interpretation
  "SYNTHETIC_INTERPRETATION", // a reading assembled across sources (DCF synthesis)
  "MODERN_RECEPTION",         // how a modern thinker or movement uses or reads the subject
  "NORMATIVE_RELEVANCE",      // why the subject matters today; normative by nature
  "CONTESTED",                // the claim is that something is uncertain or disputed
  "METHODOLOGICAL",           // a research/handling rule, not a statement about the subject
] as const;
export type EpistemicType = (typeof EPISTEMIC_TYPES)[number];

/** What kind of evidence a source provides; independent of what any claim says. */
export type SourceClass = "PRIMARY_TEXT" | "SCHOLARLY" | "MODERN_COMMENTARY" | "REFERENCE" | "DCF_FRAMEWORK" | "OTHER";

export type PassageLevel = "EXACT" | "STRONG" | "PARTIAL" | "RELATED";

/** One passage link as the contract sees it. */
export type ContractEvidence = { level: PassageLevel; sourceClass: SourceClass; workKey: string };

/**
 * Claim-level outcome. `basis` qualifies SUPPORTED (as fact, text, tradition, attribution, interpretation,
 * inference, synthesis, or reception) so the status set stays small.
 */
export type ContractStatus = "SUPPORTED" | "PARTIALLY_SUPPORTED" | "UNSUPPORTED" | "CONTESTED_REPRESENTED"
  | "INSUFFICIENT_FOR_HISTORICAL_CLAIM" | "NOT_EVIDENTIARY" | "NEEDS_TYPE_REVIEW";
export type SupportBasis = "fact" | "text" | "tradition" | "attribution" | "interpretation" | "inference" | "synthesis" | "reception";

export type ContractResult = {
  status: ContractStatus;
  /** true = contract met, false = not met, null = not an evidentiary claim (methodological). */
  satisfied: boolean | null;
  basis: SupportBasis | null;
  reasons: string[];
};

export type TypeReviewStatus = "auto_assigned" | "needs_type_review" | "human_confirmed" | "human_changed" | "kept_unclassified";

export function sourceClassOf(source: { source_type?: string | null; textual_layer?: string | null; title?: string | null; metadata?: Record<string, unknown> | null }): SourceClass {
  const type = (source.source_type || "").toLowerCase();
  const layer = (source.textual_layer || "").toLowerCase();
  const classification = String(source.metadata?.sourceClassification || "").toLowerCase();
  if (/research framework|dcf/.test(`${type} ${layer}`)) return "DCF_FRAMEWORK";
  // A spiritual or devotional reading is reception even when it is published as a book.
  if (/spiritual|devotional|commentary|reception/.test(layer)) return "MODERN_COMMENTARY";
  if (/scholar|journal|academic|article|monograph|book/.test(type)) return "SCHOLARLY";
  if (/primary|scripture|text/.test(type) || classification.includes("primary_text")) return "PRIMARY_TEXT";
  if (/institution|portal|reference|encyclop/.test(type)) return "REFERENCE";
  return "OTHER";
}

/** Readable labels used by the admin view and by answer language. */
export const TYPE_LABELS: Record<EpistemicType, string> = {
  TEXTUAL_ASSERTION: "textual assertion",
  TRADITIONAL_NARRATIVE: "traditional narrative",
  HISTORICAL_FACT: "historical claim",
  HISTORICAL_INFERENCE: "historical inference",
  SCHOLARLY_ATTRIBUTION: "scholarly attribution",
  SCHOLARLY_INTERPRETATION: "scholarly interpretation",
  SYNTHETIC_INTERPRETATION: "synthesis across sources",
  MODERN_RECEPTION: "modern reception",
  NORMATIVE_RELEVANCE: "modern relevance",
  CONTESTED: "contested or uncertain",
  METHODOLOGICAL: "research method note",
};

/** One key per underlying work, so several URLs or pages of the same work never count as independent sources. */
export function independentWorkKey(source: { id: string; title?: string | null; author?: string | null; textual_layer?: string | null; content_hash?: string | null; metadata?: unknown }): string {
  const metadata = source.metadata && typeof source.metadata === "object" ? source.metadata as Record<string, unknown> : {};
  const titleStem = (source.title || "").replace(/\b(?:sukta|hymn|verse|chapter|sarga|page)\s+[IVXLC\d]+.*$/i, "").trim();
  return String(metadata.independentWorkKey || metadata.doi || metadata.editionKey ||
    [titleStem || source.title, source.author, source.textual_layer].filter(Boolean).join("|") || source.content_hash || source.id).toLowerCase();
}
