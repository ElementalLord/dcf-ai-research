export const EXPLORATION_BUDGET = {
  maxPagesPerQuery: 12,
  maxPagesPerRun: 120,
  maxLinkDepth: 2,
  maxPreviewBytesPerPage: 256 * 1024,
  maxTotalPreviewBytesPerQuery: 3 * 1024 * 1024,
  requestDelayMs: 250,
} as const;

export function mayExploreChild(depth: number, pagesThisQuery: number, pagesThisRun: number): boolean {
  return depth < EXPLORATION_BUDGET.maxLinkDepth
    && pagesThisQuery < EXPLORATION_BUDGET.maxPagesPerQuery
    && pagesThisRun < EXPLORATION_BUDGET.maxPagesPerRun;
}
