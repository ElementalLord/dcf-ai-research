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

export function adaptiveStopReason(input: {
  sufficient: boolean; saturatedBatches: number; searchCalls: number; maxSearchRequests: number;
  hasNextQuery: boolean; manualStop?: boolean;
}): "sufficient" | "saturated" | "budget" | "manual_stop" | null {
  if (input.manualStop) return "manual_stop";
  if (input.sufficient) return "sufficient";
  if (input.searchCalls >= input.maxSearchRequests) return "budget";
  if (input.saturatedBatches >= 3 || !input.hasNextQuery) return "saturated";
  return null;
}
