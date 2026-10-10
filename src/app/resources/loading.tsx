import { Skeleton } from "@/components/ui/skeleton";

export default function ResourcesLoading() {
  return <main className="resources-page page-shell resources-route-loading" role="status" aria-label="Opening Resources">
    <div className="page-kicker">03 / RESOURCES</div>
    <div className="resource-heading"><div><p className="section-label">Research workspace</p><h1>Resources.</h1><p>Opening sources, claims, and website permissions…</p></div></div>
    <div className="resource-route-loading-tabs"><span>Sources</span><span>Claims</span><span>Websites</span></div>
    <div className="resource-route-loading-body"><Skeleton className="h-4 w-44"/><Skeleton className="h-10 w-72"/><Skeleton className="h-10 w-full"/>{[0, 1, 2, 3].map(index => <div className="resource-loading-row" key={index}><Skeleton className="h-4 w-2/3"/><Skeleton className="h-4 w-1/5"/></div>)}</div>
  </main>;
}
