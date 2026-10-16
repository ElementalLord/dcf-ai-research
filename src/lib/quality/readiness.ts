export type ReadinessState = "STRONG" | "USABLE" | "THIN" | "NEEDS ATTENTION";

export type ReadinessInput = {
  sources: number;
  domains: number;
  primarySources: number;
  authoritativeSources: number;
  passages: number;
  totalClaims: number;
  approvedClaims: number;
  rejectedClaims: number;
  claimsWithPassages: number;
  supportedContracts: number;
  evaluatedContracts: number;
  evaluationQuestions: number;
  evaluationPasses: number;
  citationValid: number;
  citationSupported: number;
  retrievalSuccesses: number;
  averageLatencyMs: number | null;
  externalSearches: number;
  largestDomainSourceCount: number;
};

export type ReadinessAssessment = {
  retrievalState: ReadinessState;
  publicationState: ReadinessState;
  evidenceQualityPercent: number;
  evaluationPassPercent: number | null;
  citationValidityPercent: number | null;
  citationSupportPercent: number | null;
  retrievalSuccessPercent: number | null;
  reviewedPercent: number;
  primaryCoveragePercent: number;
  domainConcentrationPercent: number;
  gaps: string[];
};

const percent = (part: number, whole: number): number => whole ? Number((part * 100 / whole).toFixed(1)) : 0;

/**
 * Deliberately conservative thresholds. Source volume cannot compensate for missing
 * passages, weak corroboration, unreviewed claims, or failed evaluations.
 */
export function assessReadiness(input: ReadinessInput): ReadinessAssessment {
  const evidenceQualityPercent = percent(input.supportedContracts || input.claimsWithPassages, input.evaluatedContracts || input.approvedClaims);
  const evaluationPassPercent = input.evaluationQuestions ? percent(input.evaluationPasses, input.evaluationQuestions) : null;
  const citationValidityPercent = input.evaluationQuestions ? percent(input.citationValid, input.evaluationQuestions) : null;
  const citationSupportPercent = input.evaluationQuestions ? percent(input.citationSupported, input.evaluationQuestions) : null;
  const retrievalSuccessPercent = input.evaluationQuestions ? percent(input.retrievalSuccesses, input.evaluationQuestions) : null;
  const reviewedPercent = percent(input.approvedClaims + input.rejectedClaims, input.totalClaims);
  const primaryCoveragePercent = percent(input.primarySources, input.sources);
  const domainConcentrationPercent = percent(input.largestDomainSourceCount, input.sources);
  const gaps: string[] = [];

  if (input.passages < 8) gaps.push(`Only ${input.passages} locally retrievable passages`);
  if (input.claimsWithPassages < Math.min(10, input.approvedClaims)) gaps.push("Foundational claims lack passage-level support");
  if (input.domains < 3) gaps.push("Evidence comes from fewer than three web domains");
  if (domainConcentrationPercent > 65) gaps.push(`${domainConcentrationPercent}% of sources come from one domain`);
  if (!input.primarySources) gaps.push("No source is classified as primary material");
  if (input.authoritativeSources < 2) gaps.push("Fewer than two authoritative sources");
  if (reviewedPercent < 50) gaps.push(`${reviewedPercent}% of claims have a final human review status`);
  if (!input.evaluationQuestions) gaps.push("The answer pipeline has not yet been evaluated for this profile");
  else {
    if ((retrievalSuccessPercent || 0) < 80) gaps.push("Retrieval success is below 80%");
    if ((citationSupportPercent || 0) < 80) gaps.push("Citation support is below 80%");
  }

  const retrievalStrong = input.passages >= 20 && input.domains >= 4 && input.authoritativeSources >= 3
    && input.claimsWithPassages >= 10 && evidenceQualityPercent >= 75
    && evaluationPassPercent !== null && evaluationPassPercent >= 85
    && (citationSupportPercent || 0) >= 85 && (retrievalSuccessPercent || 0) >= 90;
  const retrievalUsable = input.passages >= 8 && input.domains >= 3 && input.authoritativeSources >= 2
    && input.claimsWithPassages >= 5 && evidenceQualityPercent >= 50
    && (evaluationPassPercent === null || evaluationPassPercent >= 65);
  const retrievalCritical = input.passages < 3 || input.approvedClaims < 3 || input.domains < 2
    || domainConcentrationPercent >= 90 || (evaluationPassPercent !== null && evaluationPassPercent < 40);
  const retrievalState: ReadinessState = retrievalStrong ? "STRONG" : retrievalUsable ? "USABLE" : retrievalCritical ? "NEEDS ATTENTION" : "THIN";

  const publicationStrong = retrievalState === "STRONG" && reviewedPercent >= 80 && input.approvedClaims >= 10 && evidenceQualityPercent >= 80;
  const publicationUsable = (retrievalState === "STRONG" || retrievalState === "USABLE")
    && reviewedPercent >= 50 && input.approvedClaims >= 8 && evidenceQualityPercent >= 60;
  const publicationCritical = input.approvedClaims < 3 || reviewedPercent < 10 || evidenceQualityPercent < 25;
  const publicationState: ReadinessState = publicationStrong ? "STRONG" : publicationUsable ? "USABLE" : publicationCritical ? "NEEDS ATTENTION" : "THIN";

  return { retrievalState, publicationState, evidenceQualityPercent, evaluationPassPercent, citationValidityPercent,
    citationSupportPercent, retrievalSuccessPercent, reviewedPercent, primaryCoveragePercent, domainConcentrationPercent, gaps: gaps.slice(0, 4) };
}
