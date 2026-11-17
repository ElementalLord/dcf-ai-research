import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hasAdminSession } from "@/lib/admin-session";
import ResourcesNav from "../resources-nav";
import PeopleClient from "./people-client";
import "./people.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "People | DCF Resources" };

export default async function PeoplePage() {
  if (!(await hasAdminSession())) redirect("/resources");
  return <main className="resources-page people-page page-shell">
    <ResourcesNav current="people" />
    <PeopleClient />
  </main>;
}
