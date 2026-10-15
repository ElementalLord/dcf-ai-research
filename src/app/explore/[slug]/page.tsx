import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPersonBySlug, getPhase1People, getRelatedPeople } from "@/lib/phase1/dataset";
import { ProfileClient } from "../profile-client";

export const dynamicParams = false;

export function generateStaticParams() {
  return getPhase1People().map((person) => ({ slug: person.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const person = getPersonBySlug(slug);
  if (!person) return { title: "Profile not found | DCF" };
  return {
    title: `${person.name} | DCF Inspiring Personalities`,
    description: person.shortIntroduction.map((statement) => statement.text).join(" ").slice(0, 155),
  };
}

export default async function PersonalityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const person = getPersonBySlug(slug);
  if (!person) notFound();
  return <ProfileClient person={person} related={getRelatedPeople(person)} />;
}
