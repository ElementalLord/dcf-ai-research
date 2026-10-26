import { Skeleton } from "@/components/ui/skeleton";

export default function FeedbackLoading() {
  return <main className="resources-page feedback-page page-shell" role="status" aria-label="Loading response feedback">
    <div className="resource-heading"><div><Skeleton className="h-10 w-72 max-w-full"/><Skeleton className="mt-4 h-5 w-96 max-w-full"/></div></div>
    <div className="feedback-summary"><div className="feedback-summary-total"><Skeleton className="h-8 w-14"/><Skeleton className="h-4 w-28"/></div><div className="feedback-summary-total"><Skeleton className="h-8 w-20"/><Skeleton className="h-4 w-28"/></div><div className="feedback-distribution"><Skeleton className="h-4 w-full"/><Skeleton className="h-4 w-full"/><Skeleton className="h-4 w-full"/></div></div>
    <div className="resource-route-loading-body">{Array.from({ length: 3 }, (_, index) => <div className="resource-loading-row" key={index}><Skeleton className="h-4 w-2/3"/><Skeleton className="h-4 w-1/5"/></div>)}</div>
  </main>;
}
