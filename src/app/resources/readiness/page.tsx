import { redirect } from "next/navigation";

/** Readiness now lives in Extra diagnostics. */
export default function ReadinessPage() {
  redirect("/resources/diagnostics");
}
