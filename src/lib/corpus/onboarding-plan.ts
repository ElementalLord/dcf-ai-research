export const ONBOARDING_STEPS = [
  "ingest",
  "tag",
  "embed",
  "extract_claims",
  "propose_events",
  "propose_relationships",
  "backfill",
  "benchmark",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export function normalizeOnboardingPlan(input: {
  sourceIds: string[];
  steps: OnboardingStep[];
  benchmarkQuestions?: string[];
}) {
  return {
    sourceIds: [...new Set(input.sourceIds)].slice(0, 25),
    steps: ONBOARDING_STEPS.filter((step) => input.steps.includes(step)),
    benchmarkQuestions: [...new Set((input.benchmarkQuestions || []).map((question) => question.trim()).filter(Boolean))].slice(0, 12),
  };
}
