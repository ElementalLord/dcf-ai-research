import { describe, expect, it } from "vitest";
import { buildLiveProfile, type LiveClaimRow, type LiveSourceRow } from "@/lib/explore/build-live-profile";
import { defaultShortName, exploreProfileSchema, fillAngles, periodForYear, readExploreProfile, shortEra, type ExploreProfileSettings } from "@/lib/explore/profile-settings";
import { profileSections, publicProfilePerson, toExplorePerson } from "@/app/explore/explore-data";
import { getRelatedPeople, getPhase1People, toDiscoveryPerson } from "@/lib/phase1/dataset";

const settings: ExploreProfileSettings = {
  published: true,
  group: "scientists",
  shortName: "Bhabha",
  era: { label: "1909–1966", short: "1909–1966", sortYear: 1909, period: "20th century" },
  region: { label: "Bombay, Maharashtra", broad: ["West India"] },
  wikipediaTitle: "Homi J. Bhabha",
  angles: fillAngles("scientists", "Bhabha"),
  publishedAt: null,
};

const row = {
  id: "11111111-1111-4111-8111-111111111111",
  canonical_name: "Homi J. Bhabha",
  alternate_names: ["Homi Jehangir Bhabha"],
  personality_categories: [{ is_primary: true, categories: { id: "cat", slug: "scientist", name: "Scientists, Technologists & Innovators" } }],
};

function source(id: string, status = "approved", extra: Partial<LiveSourceRow> = {}): LiveSourceRow {
  return { id, title: `Source ${id}`, author: null, publisher_or_institution: null, publication_year: null, source_type: "institutional", textual_layer: null, url: `https://${id}.example.org/page`, citation: null, rights_or_access_note: null, source_status: status, approval_origin: "human_manual", ...extra };
}

function claim(id: string, field: string, sources: string[], extra: Partial<LiveClaimRow> = {}): LiveClaimRow {
  return {
    id, claim_text: `Claim ${id} about the work`, claim_kind: "established_fact", certainty: "high", review_status: "approved", approval_origin: "human_manual", evidence_type: "established_fact",
    parameter_fields: { code: field, label: field, parameters: { code: field, name: field } },
    claim_sources: sources.map((source_id) => ({ source_id, relationship: "supports", evidence_excerpt: "excerpt", page_or_section: null })),
    ...extra,
  };
}

describe("buildLiveProfile", () => {
  it("blocks publishing until an approved claim cites an approved source", () => {
    const { readiness } = buildLiveProfile(row, settings, [claim("c1", "career", ["s1"], { review_status: "draft" })], [source("s1", "candidate")], "homi-j-bhabha");
    expect(readiness.blockers).toHaveLength(2);
    expect(readiness.pendingClaims).toBe(1);
  });

  it("shows only approved claims with approved sources, in the section their field maps to", () => {
    const { person, readiness } = buildLiveProfile(row, settings, [
      claim("life", "early life", ["s1"]),
      claim("work", "scientific contributions", ["s1"]),
      claim("legacy", "legacy", ["s2"]),
      claim("unsourced", "career", ["s3"]),
      claim("draft", "career", ["s1"], { review_status: "needs_review" }),
    ], [source("s1"), source("s2"), source("s3", "candidate")], "homi-j-bhabha");
    expect(readiness.blockers).toEqual([]);
    expect(person.lifeAndContext.map((item) => item.claimId)).toEqual(["life"]);
    expect(person.contributions.map((item) => item.claimId)).toEqual(["work"]);
    expect(person.contemporaryRelevance.map((item) => item.claimId)).toEqual(["legacy"]);
    expect(person.shortIntroduction[0].claimId).toBe("life");
    expect(readiness.shownClaims).toBe(3);
    expect(person.limitedInformation.challenges).toMatch(/do not yet document challenges/);
  });

  it("withholds a contested claim until two independent sources, one scholarly, support it", () => {
    const contested = claim("dispute", "contested questions", ["s1"], { claim_kind: "contested" });
    const single = buildLiveProfile(row, settings, [claim("life", "early life", ["s1"]), contested], [source("s1")], "homi-j-bhabha");
    expect(single.person.contestedAspects).toEqual([]);
    expect(single.readiness.withheldContested).toBe(1);
    const backed = buildLiveProfile(row, settings, [claim("life", "early life", ["s1"]), { ...contested, claim_sources: [...contested.claim_sources!, { source_id: "s2", relationship: "supports", evidence_excerpt: null, page_or_section: null }] }],
      [source("s1"), source("s2", "approved", { source_type: "scholarly_article" })], "homi-j-bhabha");
    expect(backed.person.contestedAspects.map((item) => item.claimId)).toEqual(["dispute"]);
  });

  it("renders through the same Explore helpers as the curated profiles", () => {
    const { person } = buildLiveProfile(row, settings, [claim("life", "early life", ["s1"]), claim("work", "contributions", ["s1"])], [source("s1")], "homi-j-bhabha");
    const card = toExplorePerson(toDiscoveryPerson(person), person, settings);
    expect(card.presentationCategory.id).toBe("scientists");
    expect(card.angles).toHaveLength(4);
    expect(card.period).toBe("20th century");
    const page = publicProfilePerson(person, settings);
    expect(page.group).toBe("scientists");
    expect(profileSections(page).map((section) => section.key)).toContain("contributions");
    const related = getRelatedPeople(person, 3, [...getPhase1People(), person]);
    expect(related).toHaveLength(3);
    expect(related.every((item) => item.id !== person.id)).toBe(true);
  });
});

describe("Explore profile settings", () => {
  it("validates stored settings and rejects malformed ones", () => {
    expect(exploreProfileSchema.safeParse(settings).success).toBe(true);
    expect(readExploreProfile({ ...settings, group: "unknown" })).toBeNull();
    expect(readExploreProfile(null)).toBeNull();
  });

  it("derives timeline period, short era and short name", () => {
    expect(periodForYear(null)).toBe("Vedic and epic tradition");
    expect(periodForYear(-268)).toBe("Ancient (before 500 CE)");
    expect(periodForYear(1630)).toBe("Medieval to early modern (1300–1800)");
    expect(periodForYear(1863)).toBe("19th century");
    expect(shortEra("Born 1909 in Bombay; died 1966")).toBe("Born 1909 in Bombay; died 1966");
    expect(shortEra("Lived 1909 - 1966, Bombay")).toBe("1909–1966");
    expect(defaultShortName("Homi Jehangir Bhabha")).toBe("Bhabha");
    expect(defaultShortName("Guru Nanak")).toBe("Guru Nanak");
  });
});
