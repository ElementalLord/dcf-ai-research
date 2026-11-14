import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyPhase1Curation, PROFILE_SECTION_KEYS } from "../scripts/lib/phase1-curation.mjs";
import { getPhase1Dataset, getPhase1People } from "@/lib/phase1/dataset";

type Entry = { id: string; text: string; reviewStatus: string; profileEligibility: { eligible: boolean } };
type Person = Record<string, unknown> & { id: string; name: string; evidenceRegister: Entry[] };

const root = process.cwd();
const readJson = (file: string) => JSON.parse(readFileSync(path.join(root, file), "utf8"));
const RISHI_DOC_PARAMETERS = 10;
const RULER_DOC_PARAMETERS = 9;

describe("Phase 1 editorial curation", () => {
  it("gives every person an era and region backed by approved, sourcing-compliant claims", () => {
    const dataset = getPhase1Dataset() as unknown as { personalities: Array<Person & { era: { label: string; period: string; supportingClaimIds: string[] }; region: { label: string; broad: string[]; supportingClaimIds: string[] } }> };
    for (const person of dataset.personalities) {
      for (const fact of [person.era, person.region]) {
        expect(fact.label, person.name).toBeTruthy();
        expect(fact.supportingClaimIds.length, person.name).toBeGreaterThan(0);
        for (const id of fact.supportingClaimIds) {
          const entry = person.evidenceRegister.find((item) => item.id === id);
          expect(entry?.reviewStatus, `${person.name} ${id}`).toBe("approved");
          expect(entry?.profileEligibility.eligible, `${person.name} ${id}`).toBe(true);
        }
      }
      expect(person.region.broad.length, person.name).toBeGreaterThan(0);
    }
  });

  it("keeps each claim in a single profile section", () => {
    for (const person of getPhase1People()) {
      const ids = PROFILE_SECTION_KEYS.flatMap((key: string) => (person[key as keyof typeof person] as Array<{ claimId: string }>).map((statement) => statement.claimId));
      expect(new Set(ids).size, person.name).toBe(ids.length);
    }
  });

  it("explains every empty section with a limited-information note", () => {
    for (const person of getPhase1People()) {
      for (const key of PROFILE_SECTION_KEYS as string[]) {
        const statements = person[key as keyof typeof person] as unknown[];
        if (!statements.length) expect(person.limitedInformation[key as keyof typeof person.limitedInformation], `${person.name} / ${key}`).toBeTruthy();
      }
    }
  });

  it("applies the DCF Rishi and Ruler parameter documents to the matching people", () => {
    const people = getPhase1People();
    const byName = new Map(people.map((person) => [person.name, person]));
    for (const name of ["Agastya", "Vasistha", "Vishvamitra", "Yajnavalkya", "Adi Shankaracharya"]) {
      expect(byName.get(name)?.studyFramework?.id, name).toBe("rishi");
      expect(byName.get(name)?.studyFramework?.parameters).toHaveLength(RISHI_DOC_PARAMETERS);
    }
    for (const name of ["Ashoka", "Chhatrapati Shivaji Maharaj", "Rajaraja Chola I", "Rani Lakshmibai of Jhansi"]) {
      expect(byName.get(name)?.studyFramework?.id, name).toBe("ruler");
      expect(byName.get(name)?.studyFramework?.parameters).toHaveLength(RULER_DOC_PARAMETERS);
    }
    for (const person of people) {
      for (const parameter of person.studyFramework?.parameters ?? []) {
        if (parameter.status === "limited") expect(parameter.note, `${person.name} / ${parameter.code}`).toBeTruthy();
        else expect(parameter.fields.some((field) => field.statements.length), `${person.name} / ${parameter.code}`).toBe(true);
      }
    }
  });

  it("is idempotent when re-applied to the curated export", () => {
    const curated = readJson("data/exports/dcf-phase1-personalities.json");
    const again = applyPhase1Curation(structuredClone(curated), readJson("data/phase1-curation.json"));
    expect(again).toEqual(curated);
  });

  it("rejects a curation that points at a claim outside the evidence register", () => {
    const curation = readJson("data/phase1-curation.json");
    const [firstId] = Object.keys(curation.people);
    curation.people[firstId].era.supportingClaimIds = ["00000000"];
    expect(() => applyPhase1Curation(readJson("data/exports/dcf-phase1-personalities.json"), curation)).toThrow(/matches 0 evidence-register entries/);
  });

  it("rejects adding a claim that fails the sourcing rule", () => {
    const dataset = readJson("data/exports/dcf-phase1-personalities.json");
    const person = dataset.personalities.find((item: Person) => item.evidenceRegister.some((entry) => !entry.profileEligibility.eligible));
    const ineligible = person.evidenceRegister.find((entry: Entry) => !entry.profileEligibility.eligible);
    const curation = readJson("data/phase1-curation.json");
    curation.people[person.id].sections = { add: { contributions: [ineligible.id] } };
    expect(() => applyPhase1Curation(dataset, curation)).toThrow(/sourcing rule|not approved/);
  });
});
