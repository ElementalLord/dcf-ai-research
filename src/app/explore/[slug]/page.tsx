import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPhase1People } from "@/lib/phase1/dataset";
import { chosenPhotos, getExplorePerson, portraitTitles } from "@/lib/explore/collection";
import { getPortraits } from "@/lib/portraits";
import { approvedStatements, groupOf, publicProfilePerson } from "../explore-data";
import { ProfileClient } from "../profile-client";

// The 25 curated profiles are built ahead of time. People published from Resources → People are
// rendered on first visit; publishing refreshes the page at once, and every page refreshes within
// five minutes so newly approved claims appear without a deploy.
export const dynamicParams = true;
export const revalidate = 300;

export function generateStaticParams() {
  return getPhase1People().map((person) => ({ slug: person.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const found = await getExplorePerson(slug);
  if (!found) return { title: "Profile not found | DCF" };
  const { person } = found;
  return {
    title: `${person.name} | DCF Inspiring Personalities`,
    description: (approvedStatements(person, "shortIntroduction").map((statement) => statement.text).join(" ") || `Explore source records for ${person.name} in the DCF collection.`).slice(0, 155),
  };
}

export default async function PersonalityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await getExplorePerson(slug);
  if (!found) notFound();
  const { person, settings, related: relatedPeople, collection } = found;
  const bySlug = new Map(collection.people.map((item) => [item.slug, item]));
  const related = relatedPeople.map(({ id, slug: relatedSlug, name, detailedCategory, eraShort }) => ({ id, slug: relatedSlug, name, detailedCategory, eraShort, field: groupOf(bySlug.get(relatedSlug)!).id }));
  const portraits = await getPortraits([slug, ...related.map((item) => item.slug)], portraitTitles(collection.settings), chosenPhotos(collection.settings));
  return <ProfileClient person={publicProfilePerson(person, settings)} portrait={portraits[slug] ?? null} related={related} relatedPortraits={portraits} />;
}
