import { Skeleton } from "@/components/ui/skeleton";

export default function AiLoading() {
  return <main className="ai-loading-page" role="status" aria-label="Opening Ask DCF">
    <p className="section-label">Ask DCF</p>
    <h1>Start with a question.</h1>
    <p>Opening the research desk…</p>
    <div className="ai-loading-form"><Skeleton className="h-4 w-20"/><Skeleton className="h-10 w-64"/><Skeleton className="mt-6 h-4 w-24"/><Skeleton className="h-28 w-full"/><div><Skeleton className="h-10 w-36"/><Skeleton className="h-10 w-28"/></div></div>
  </main>;
}
