import { Skeleton } from "@/components/ui/skeleton";

export default function DiagnosticsLoading() {
  return <main className="resources-page knowledge-page page-shell" role="status" aria-label="Loading diagnostics"><Skeleton className="h-10 w-72"/><Skeleton className="mt-4 h-5 w-96 max-w-full"/><div className="resource-route-loading-body">{Array.from({ length: 4 }, (_, index) => <div className="resource-loading-row" key={index}><Skeleton className="h-4 w-2/3"/><Skeleton className="h-4 w-1/5"/></div>)}</div></main>;
}
