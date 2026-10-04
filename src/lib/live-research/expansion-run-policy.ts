export type ExpansionStatus = "running" | "stopped" | "complete";

export function nextExpansionStatus(input: {
  current: ExpansionStatus;
  nextQueryIndex: number;
  queryCount: number;
  searchCalls: number;
  maxSearchRequests: number;
  saturatedSteps: number;
  errorCategory: string | null;
}): ExpansionStatus {
  if (input.current === "stopped" || input.errorCategory) return "stopped";
  if (input.nextQueryIndex >= input.queryCount || input.searchCalls >= input.maxSearchRequests || input.saturatedSteps >= 3) return "complete";
  return "running";
}

export function canResumeExpansion(input: { status: string; nextQueryIndex: number; queryCount: number; searchCalls: number; maxSearchRequests: number }): boolean {
  return input.status === "stopped" && input.nextQueryIndex < input.queryCount && input.searchCalls < input.maxSearchRequests;
}
