export type Phase1PresentationCategory = {
  id: string;
  name: string;
  description: string;
};

export type Phase1DetailedCategory = {
  categoryId: string;
  slug: string | null;
  name: string | null;
  isPrimary: boolean;
};

export type Phase1Citation = {
  sourceId: string;
  relationship: string;
  locator: string | null;
  evidenceExcerpt: string | null;
};

export type Phase1Statement = {
  claimId: string;
  text: string;
  reviewStatus: string;
  approvalOrigin: string;
  certainty: string;
  evidenceType: string;
  claimKind: string;
  framework: {
    parameterCode: string | null;
    parameterName: string | null;
    fieldCode: string;
    fieldLabel: string;
  } | null;
  citations: Phase1Citation[];
};

export type Phase1Source = {
  id: string;
  title: string;
  author: string | null;
  publisherOrInstitution: string | null;
  publicationYear: number | null;
  sourceType: string;
  textualLayer: string | null;
  url: string | null;
  citation: string | null;
  rightsOrAccessNote: string | null;
  sourceStatus: string;
  approvalOrigin: string;
};

export type Phase1SectionKey =
  | "lifeAndContext"
  | "qualitiesValues"
  | "contributions"
  | "challenges"
  | "leadershipRelationalCharacteristics"
  | "contestedAspects"
  | "contemporaryRelevance";

/** A structured fact (era or region) backed by approved claims in the evidence register. */
export type Phase1Era = {
  label: string;
  short: string;
  sortYear: number | null;
  period: string;
  supportingClaimIds: string[];
};

export type Phase1Region = {
  label: string;
  broad: string[];
  supportingClaimIds: string[];
};

export type Phase1StudyField = {
  code: string;
  label: string;
  claimCount: number;
  claimIds: string[];
  statements: Phase1Statement[];
};

export type Phase1StudyParameter = {
  code: string;
  name: string;
  status: "documented" | "limited";
  claimCount: number;
  note: string | null;
  fields: Phase1StudyField[];
};

/** A DCF parameter document (for example "Parameters to study Rishis") applied to one person. */
export type Phase1StudyFramework = {
  id: string;
  title: string;
  reference: string;
  method: string;
  parameters: Phase1StudyParameter[];
};

export type Phase1Personality = {
  id: string;
  slug: string;
  name: string;
  alternateNames: string[];
  type: string | null;
  category: Phase1DetailedCategory | null;
  categories: Phase1DetailedCategory[];
  phase1PresentationCategory: Phase1PresentationCategory;
  phase1PresentationCategoryStatus: string;
  era: Phase1Era;
  region: Phase1Region;
  shortIntroduction: Phase1Statement[];
  lifeAndContext: Phase1Statement[];
  qualitiesValues: Phase1Statement[];
  contributions: Phase1Statement[];
  challenges: Phase1Statement[];
  leadershipRelationalCharacteristics: Phase1Statement[];
  contestedAspects: Phase1Statement[];
  contemporaryRelevance: Phase1Statement[];
  limitedInformation: Partial<Record<Phase1SectionKey, string>>;
  studyFramework: Phase1StudyFramework | null;
  lenses: string[];
  sources: Phase1Source[];
  citations: string[];
  reviewStatus: {
    mentorApproval: string;
    profileDraftStatus: string;
    unresolvedConcerns: string[];
  };
};

export type Phase1DiscoveryPerson = {
  id: string;
  slug: string;
  name: string;
  alternateNames: string[];
  presentationCategory: Phase1PresentationCategory;
  detailedCategory: string | null;
  era: string;
  eraShort: string;
  period: string;
  sortYear: number | null;
  region: string;
  regions: string[];
  lenses: string[];
  introduction: string;
  searchText: string;
};

export type RelatedPerson = Phase1DiscoveryPerson & { reason: string };

export type Phase1Dataset = {
  schemaVersion: string;
  generatedAt: string;
  summary: {
    personalityCount: number;
    fiveCategoriesByFiveSatisfied: boolean;
    readyForMentorReviewCount: number;
  };
  phase1Presentation: {
    status: string;
    categories: Array<Phase1PresentationCategory & { personalityIds: string[] }>;
  };
  personalities: Array<Omit<Phase1Personality, "slug">>;
};
