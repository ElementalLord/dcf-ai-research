import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPersonBySlug, getPhase1People, getRelatedPeople } from "@/lib/phase1/dataset";
import { approvedStatements, publicProfilePerson } from "../explore-data";
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
    description: (approvedStatements(person, "shortIntroduction").map((statement) => statement.text).join(" ") || `Explore source records for ${person.name} in the DCF collection.`).slice(0, 155),
  };
}

export default async function PersonalityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const person = getPersonBySlug(slug);
  if (!person) notFound();
  return <ProfileClient person={publicProfilePerson(person)} related={getRelatedPeople(person).map(({ id, slug: relatedSlug, name, detailedCategory, era }) => ({ id, slug: relatedSlug, name, detailedCategory, era }))} />;
}
