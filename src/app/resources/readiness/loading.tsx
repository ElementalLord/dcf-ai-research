import { Skeleton } from "@/components/ui/skeleton";

export default function ReadinessLoading() {
  return <main className="resources-page readiness-page page-shell" role="status" aria-label="Loading readiness"><div className="readiness-heading"><div><Skeleton className="h-10 w-72"/><Skeleton className="mt-4 h-5 w-96 max-w-full"/></div></div><div className="readiness-summary">{Array.from({ length: 4 }, (_, index) => <div key={index}><Skeleton className="h-8 w-12"/><Skeleton className="h-4 w-24"/></div>)}</div><div className="resource-route-loading-body">{Array.from({ length: 3 }, (_, index) => <div className="resource-loading-row" key={index}><Skeleton className="h-4 w-2/3"/><Skeleton className="h-4 w-1/5"/></div>)}</div></main>;
}
