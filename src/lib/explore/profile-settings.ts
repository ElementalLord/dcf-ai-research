import { z } from "zod";

/**
 * Explore settings for a person added through Resources → People. Stored in
 * `personalities.explore_profile`. Safe to import in client components.
 */

export const EXPLORE_GROUPS = [
  { id: "sages", name: "Sages and philosophical traditions" },
  { id: "spiritual", name: "Spiritual teachers and reformers" },
  { id: "scientists", name: "Scientists and institution builders" },
  { id: "rulers", name: "Rulers and freedom fighters" },
  { id: "cultural", name: "Cultural figures" },
] as const;

export type ExploreGroupId = (typeof EXPLORE_GROUPS)[number]["id"];

/** Timeline groups on Explore, in order. */
export const ERA_PERIODS = [
  "Vedic and epic tradition",
  "Ancient (before 500 CE)",
  "Early medieval (500–1300 CE)",
  "Medieval to early modern (1300–1800)",
  "19th century",
  "20th century",
] as const;

/** Broad regions used by the Explore region filter. */
export const BROAD_REGIONS = ["North India", "South India", "East India", "West India", "Central India", "Pan-Indian", "International", "Textual tradition"] as const;

/** Suggested research category for each Explore group, so the form can preselect one. */
export const GROUP_CATEGORY_HINT: Record<ExploreGroupId, string[]> = {
  sages: ["rishi"],
  spiritual: ["spiritual_teacher", "educator_social_reformer"],
  scientists: ["scientist", "business_institution_builder", "social_entrepreneur"],
  rulers: ["political_leader", "ruler", "warriors_freedom_fighters"],
  cultural: ["cultural_figure", "musician_performer"],
};

/** Ready-made reading angles per group. Editors can keep, edit or replace them. {name} is filled in. */
export const ANGLE_TEMPLATES: Record<ExploreGroupId, Array<{ lens: string; title: string; question: string }>> = {
  sages: [
    { lens: "textual", title: "In the texts", question: "How is {name} represented in the texts associated with the name?" },
    { lens: "philosophical", title: "Core ideas", question: "Which ideas do the sources connect with {name}?" },
    { lens: "educational", title: "Teaching and counsel", question: "What roles does {name} take in accounts of teaching?" },
    { lens: "historical", title: "Layers of tradition", question: "How do earlier and later portrayals of {name} differ?" },
  ],
  spiritual: [
    { lens: "spiritual", title: "Teachings", question: "What did {name} teach, in the words of the sources?" },
    { lens: "social", title: "Work in society", question: "How did {name} connect spiritual life with service to others?" },
    { lens: "educational", title: "Followers and students", question: "How were these teachings passed on?" },
    { lens: "historical", title: "Life and setting", question: "What do the sources establish about the life of {name}?" },
  ],
  scientists: [
    { lens: "scientific", title: "The work itself", question: "What did {name} discover, build, or show?" },
    { lens: "institutional", title: "Institutions", question: "Which institutions shaped, or were shaped by, {name}?" },
    { lens: "educational", title: "Training and teaching", question: "How did {name} learn and teach?" },
    { lens: "national", title: "Recognition and legacy", question: "How is the work of {name} remembered today?" },
  ],
  rulers: [
    { lens: "political", title: "Power and rule", question: "How did {name} gain, use, or resist power?" },
    { lens: "military", title: "Conflict", question: "What do the sources say about the conflicts involving {name}?" },
    { lens: "administrative", title: "Governing", question: "What do records show about how {name} organised people and territory?" },
    { lens: "cultural", title: "Later memory", question: "How do sources separate the historical {name} from later public memory?" },
  ],
  cultural: [
    { lens: "artistic", title: "The work", question: "Which works define {name}, and how were they made?" },
    { lens: "cultural", title: "Audiences", question: "Who encountered the work of {name}, and how?" },
    { lens: "social", title: "Art and society", question: "How did the work of {name} engage with the society of its time?" },
    { lens: "international", title: "Reach and legacy", question: "How has the work of {name} travelled and lasted?" },
  ],
};

const text = (max: number) => z.string().trim().max(max);

export const angleSchema = z.object({
  lens: text(40).min(2),
  title: text(80).min(2),
  question: text(300).min(8),
});

export const exploreProfileSchema = z.object({
  published: z.boolean(),
  group: z.enum(EXPLORE_GROUPS.map((group) => group.id) as [ExploreGroupId, ...ExploreGroupId[]]),
  shortName: text(80).min(1),
  era: z.object({
    label: text(120).min(2),
    short: text(40).min(1),
    /** Approximate year for timeline ordering; negative for BCE; null when traditional or unknown. */
    sortYear: z.number().int().min(-5000).max(2100).nullable(),
    period: z.enum(ERA_PERIODS),
  }),
  region: z.object({
    label: text(160).min(2),
    broad: z.array(z.enum(BROAD_REGIONS)).min(1).max(4),
  }),
  wikipediaTitle: text(200).nullable(),
  /** A photo chosen in Resources (uploaded or linked). Shown instead of the Wikipedia image. */
  photo: z.object({ url: z.string().trim().url().max(2000).refine((value) => /^https:\/\//i.test(value), "Use an https link"), credit: text(300) }).nullable().optional(),
  angles: z.array(angleSchema).max(6),
  publishedAt: z.string().nullable().optional(),
});

export type ExploreProfileSettings = z.infer<typeof exploreProfileSchema>;

/** Parses stored settings, returning null for missing or malformed values instead of throwing. */
export function readExploreProfile(value: unknown): ExploreProfileSettings | null {
  const parsed = exploreProfileSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** The timeline period that a year falls in. Traditional figures without a year belong to the Vedic and epic group. */
export function periodForYear(year: number | null): (typeof ERA_PERIODS)[number] {
  if (year === null) return "Vedic and epic tradition";
  if (year < 500) return "Ancient (before 500 CE)";
  if (year < 1300) return "Early medieval (500–1300 CE)";
  if (year < 1800) return "Medieval to early modern (1300–1800)";
  if (year < 1900) return "19th century";
  return "20th century";
}

/** A compact era label such as "1863–1902" or "c. 3rd century BCE", used on cards. */
export function shortEra(label: string) {
  const range = label.match(/(c\.\s*)?\d{1,4}\s*(BCE|CE)?\s*[–-]\s*\d{1,4}\s*(BCE|CE)?/i);
  return (range?.[0] ?? label).replace(/\s*-\s*/, "–").slice(0, 40);
}

/** Default short name: the last word of the name, or the whole name for one or two words. */
export function defaultShortName(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.length > 2 ? words[words.length - 1] : name.trim();
}

export function fillAngles(group: ExploreGroupId, shortName: string) {
  return ANGLE_TEMPLATES[group].map((angle) => ({ ...angle, question: angle.question.replaceAll("{name}", shortName || "this person") }));
}
