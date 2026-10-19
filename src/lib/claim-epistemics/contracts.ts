import type { ContractEvidence, ContractResult, EpistemicType, PassageLevel, SourceClass, SupportBasis } from "./types";

/**
 * Evidence contracts: what TOTAL evidence is sufficient for each kind of claim. Passage support levels say how
 * one passage supports a claim; a contract says whether the claim's evidence, taken together, is enough for
 * that kind of statement. Central configuration: change requirements here, then bump CONTRACT_VERSION.
 */
export type Contract = {
  description: string;
  /** The requirement that satisfies the contract, checked in order; the first met wins. */
  satisfiedBy: Array<{ basis: SupportBasis; minLevel: PassageLevel; from: SourceClass[] | "any"; minIndependentWorks?: number; label: string }>;
  /** Evidence that can never satisfy this contract alone, with the status it yields. */
  insufficientWhenOnly?: { from: SourceClass[]; status: "INSUFFICIENT_FOR_HISTORICAL_CLAIM"; label: string };
  /** For contested claims the outcome is represented disagreement, not a winner. */
  satisfiedStatus?: "SUPPORTED" | "CONTESTED_REPRESENTED";
  evidentiary?: false;
};

const DIRECT_TEXT: SourceClass[] = ["PRIMARY_TEXT", "REFERENCE"];
const INTERPRETIVE_WORKS: SourceClass[] = ["SCHOLARLY", "MODERN_COMMENTARY"];

export const CONTRACTS: Record<EpistemicType, Contract> = {
  TEXTUAL_ASSERTION: {
    description: "One direct passage from the text (or a reference edition of it) at a stable locator.",
    satisfiedBy: [{ basis: "text", minLevel: "EXACT", from: DIRECT_TEXT, label: "exact passage in the text" }],
  },
  TRADITIONAL_NARRATIVE: {
    description: "A direct passage showing the tradition narrates it. Establishes the narrative, never that it happened.",
    satisfiedBy: [{ basis: "tradition", minLevel: "EXACT", from: [...DIRECT_TEXT, "SCHOLARLY"], label: "exact passage of the narrative" }],
  },
  HISTORICAL_FACT: {
    description: "Scholarly or historical evidence, corroborated by at least two independent works; narrative alone is never enough.",
    satisfiedBy: [{ basis: "fact", minLevel: "STRONG", from: ["SCHOLARLY", "REFERENCE"], minIndependentWorks: 2, label: "two independent historical/scholarly works" }],
    insufficientWhenOnly: { from: ["PRIMARY_TEXT", "MODERN_COMMENTARY", "DCF_FRAMEWORK", "OTHER"], status: "INSUFFICIENT_FOR_HISTORICAL_CLAIM",
      label: "only narrative or commentary evidence; a text narrating an event does not establish that it happened" },
  },
  CONTEMPORARY_OBSERVATION: {
    description: "A dated observation with its year, units, population and originating official release.",
    satisfiedBy: [{ basis: "fact", minLevel: "EXACT", from: ["REFERENCE"], label: "exact originating statistical release" }],
  },
  SCIENTIFIC_PRIORITY: {
    description: "Original scientific work plus independent scholarly chronology; priority is never established by an institutional claim alone.",
    satisfiedBy: [{ basis: "fact", minLevel: "STRONG", from: ["SCHOLARLY", "PRIMARY_TEXT"], minIndependentWorks: 2,
      label: "original work and independent historical scholarship" }],
  },
  CAUSAL_SIGNIFICANCE: {
    description: "A qualified causal or impact interpretation supported by independent scholarship.",
    satisfiedBy: [{ basis: "interpretation", minLevel: "STRONG", from: ["SCHOLARLY"], minIndependentWorks: 2,
      label: "two independent scholarly analyses" }],
  },
  HISTORICAL_INFERENCE: {
    description: "Grounded in scholarship, or in at least two independent works; remains an inference.",
    satisfiedBy: [
      { basis: "inference", minLevel: "STRONG", from: ["SCHOLARLY"], label: "substantial scholarly support" },
      { basis: "inference", minLevel: "STRONG", from: "any", minIndependentWorks: 2, label: "substantial support in two independent works" },
    ],
  },
  SCHOLARLY_ATTRIBUTION: {
    description: "The attributed work itself directly states the view.",
    satisfiedBy: [{ basis: "attribution", minLevel: "EXACT", from: INTERPRETIVE_WORKS, label: "exact passage in the attributed work" }],
  },
  SCHOLARLY_INTERPRETATION: {
    description: "Substantial support in scholarship or interpretive work; stays labeled as interpretation.",
    satisfiedBy: [{ basis: "interpretation", minLevel: "STRONG", from: INTERPRETIVE_WORKS, label: "substantial support in interpretive scholarship" }],
  },
  SYNTHETIC_INTERPRETATION: {
    description: "A reading assembled across sources: substantial support in at least two independent works, labeled as synthesis.",
    satisfiedBy: [{ basis: "synthesis", minLevel: "STRONG", from: "any", minIndependentWorks: 2, label: "substantial support in two independent works" }],
  },
  MODERN_RECEPTION: {
    description: "A modern or interpretive source substantially shows the reception; establishes the reception, not the underlying fact.",
    satisfiedBy: [{ basis: "reception", minLevel: "STRONG", from: INTERPRETIVE_WORKS, label: "substantial support in a modern source" }],
  },
  NORMATIVE_RELEVANCE: {
    description: "Attributed to a modern source, or labeled DCF synthesis grounded in two independent works. Never ancient fact.",
    satisfiedBy: [
      { basis: "reception", minLevel: "STRONG", from: INTERPRETIVE_WORKS, label: "attributed to a modern source" },
      { basis: "synthesis", minLevel: "STRONG", from: "any", minIndependentWorks: 2, label: "DCF synthesis grounded in two independent works" },
    ],
  },
  CONTESTED: {
    description: "The disagreement or uncertainty is represented: scholarship on the question, two independent works, or a recorded conflicting claim.",
    satisfiedBy: [
      { basis: "interpretation", minLevel: "STRONG", from: ["SCHOLARLY"], label: "scholarship addressing the question" },
      { basis: "interpretation", minLevel: "STRONG", from: "any", minIndependentWorks: 2, label: "two independent works" },
    ],
    satisfiedStatus: "CONTESTED_REPRESENTED",
  },
  METHODOLOGICAL: {
    description: "A research or handling rule; not evidence about the subject and outside evidence coverage.",
    satisfiedBy: [],
    evidentiary: false,
  },
};

const RANK: Record<PassageLevel, number> = { EXACT: 4, STRONG: 3, PARTIAL: 2, RELATED: 1 };

/**
 * Evaluates one claim's total evidence against its type's contract. `conflictSupported` is true when a recorded
 * conflicting/alternative claim is itself supported, which represents disagreement for contested claims.
 */
export function evaluateContract(type: EpistemicType | null, evidence: ContractEvidence[], options: { conflictSupported?: boolean } = {}): ContractResult {
  if (!type) return { status: "NEEDS_TYPE_REVIEW", satisfied: false, basis: null, reasons: ["Claim type not yet established; evidence cannot be judged against a contract"] };
  const contract = CONTRACTS[type];
  if (contract.evidentiary === false) return { status: "NOT_EVIDENTIARY", satisfied: null, basis: null, reasons: [contract.description] };
  for (const requirement of contract.satisfiedBy) {
    const qualifying = evidence.filter((item) => RANK[item.level] >= RANK[requirement.minLevel]
      && (requirement.from === "any" || requirement.from.includes(item.sourceClass)));
    const works = new Set(qualifying.map((item) => item.workKey)).size;
    if (qualifying.length && works >= (requirement.minIndependentWorks || 1))
      return { status: contract.satisfiedStatus || "SUPPORTED", satisfied: true, basis: requirement.basis, reasons: [`Satisfied by ${requirement.label}`] };
  }
  if (type === "CONTESTED" && options.conflictSupported)
    return { status: "CONTESTED_REPRESENTED", satisfied: true, basis: "interpretation", reasons: ["Satisfied by a recorded, supported conflicting claim"] };
  const useful = evidence.filter((item) => RANK[item.level] >= RANK.PARTIAL);
  if (contract.insufficientWhenOnly && useful.length && useful.every((item) => contract.insufficientWhenOnly!.from.includes(item.sourceClass)))
    return { status: contract.insufficientWhenOnly.status, satisfied: false, basis: null, reasons: [contract.insufficientWhenOnly.label] };
  const strongest = useful.sort((a, b) => RANK[b.level] - RANK[a.level])[0];
  return strongest
    ? { status: "PARTIALLY_SUPPORTED", satisfied: false, basis: null, reasons: [`Best evidence is ${strongest.level} from ${strongest.sourceClass.toLowerCase().replace("_", " ")}; contract requires ${contract.satisfiedBy.map((item) => item.label).join(" or ")}`] }
    : { status: "UNSUPPORTED", satisfied: false, basis: null, reasons: ["No passage supports this claim"] };
}

/** Types whose contract requires direct factual/textual support; their coverage stays exact-dependent. */
export const DIRECT_EVIDENCE_TYPES = new Set<EpistemicType>(["TEXTUAL_ASSERTION", "TRADITIONAL_NARRATIVE", "HISTORICAL_FACT"]);

/**
 * For a claim whose type is unresolved: it meets its evidence standard only if it meets the contract of EVERY
 * plausible type, so the outcome never depends on guessing the type. Otherwise it awaits type review.
 */
export function evaluateUnresolved(candidates: EpistemicType[], evidence: ContractEvidence[], options: { conflictSupported?: boolean } = {}): ContractResult & { typeDependent: boolean } {
  const results = candidates.map((candidate) => ({ candidate, result: evaluateContract(candidate, evidence, options) }));
  const evidentiary = results.filter((item) => item.result.satisfied !== null);
  const robust = evidentiary.length > 0 && evidentiary.every((item) => item.result.satisfied === true);
  return { status: "NEEDS_TYPE_REVIEW", satisfied: robust, basis: robust ? evidentiary[0].result.basis : null, typeDependent: !robust,
    reasons: robust ? [`Met under every plausible type (${candidates.join(", ")}); type still awaits review`]
      : [`Outcome depends on the unresolved type: ${results.map((item) => `${item.candidate} ${item.result.satisfied === true ? "met" : item.result.satisfied === null ? "n/a" : "unmet"}`).join("; ")}`] };
}
