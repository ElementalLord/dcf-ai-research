import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { getPhase1People } from "@/lib/phase1/dataset";
import { exploreProfileSchema } from "@/lib/explore/profile-settings";
import { exploreCategory } from "@/app/explore/explore-data";
import { profileAngles } from "@/app/explore/profile-angles";
import { applyCuratedEdit } from "@/lib/explore/collection";

describe("curated profiles in the People editor", () => {
  it("every curated profile pre-fills a valid form", () => {
    const failures = getPhase1People().flatMap((person) => {
      const parsed = exploreProfileSchema.safeParse({
        published: true, group: exploreCategory(person.slug).id, shortName: person.shortName,
        era: { label: person.era.label, short: person.era.short, sortYear: person.era.sortYear, period: person.era.period },
        region: { label: person.region.label, broad: person.region.broad.slice(0, 4) },
        wikipediaTitle: null, photo: null, angles: profileAngles(person.slug).slice(0, 6), publishedAt: null,
      });
      return parsed.success ? [] : [`${person.slug}: ${parsed.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join("; ")}`];
    });
    expect(failures).toEqual([]);
  });

  it("an edit changes presentation details and the group, never the reviewed text", () => {
    const person = getPhase1People().find((item) => item.slug === "c-v-raman")!;
    const edited = applyCuratedEdit(person, {
      published: true, group: "cultural", shortName: "Raman", era: { label: "1888–1970", short: "1888–1970", sortYear: 1888, period: "20th century" },
      region: { label: "Tiruchirappalli", broad: ["South India"] }, wikipediaTitle: null, photo: null, angles: [],
    }, ["Sir C. V. Raman"]);
    expect(edited.era.label).toBe("1888–1970");
    expect(edited.alternateNames).toEqual(["Sir C. V. Raman"]);
    expect(exploreCategory(edited.slug, edited.phase1PresentationCategory.id).id).toBe("cultural");
    expect(edited.contributions).toBe(person.contributions);
    expect(exploreCategory(person.slug, person.phase1PresentationCategory.id).id).toBe("scientists");
  });
});
