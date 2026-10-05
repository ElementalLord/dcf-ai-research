import { redirect } from "next/navigation";
import { hasAdminSession } from "@/lib/admin-session";
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  if (!(await hasAdminSession())) redirect("/resources");
  return children;
}
