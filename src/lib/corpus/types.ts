export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export type DocumentSection = {
  title?: string | null;
  pageOrSection?: string | null;
  text: string;
  metadata?: JsonObject;
};

export type CorpusChunk = {
  chunkIndex: number;
  text: string;
  sectionTitle: string | null;
  pageOrSection: string | null;
  startOffset: number | null;
  endOffset: number | null;
  tokenEstimate: number;
  contentHash: string;
  metadata: JsonObject;
};

export type ParameterField = {
  id: string;
  code: string;
  label: string;
  parameterId: string;
  parameterCode: string;
  parameterName: string;
};

export type RetrievedPassage = {
  kind: "passage";
  id: string;
  chunkId: string;
  sourceId: string;
  text: string;
  sectionTitle: string | null;
  pageOrSection: string | null;
  textualLayer: string | null;
  sourceTitle: string;
  sourceAuthor: string | null;
  sourceInstitution: string | null;
  sourceUrl: string | null;
  sourceType: string | null;
  sourceStatus: string;
  personalityId?: string;
  personalityName?: string;
  origin?: "permanent" | "live_cache";
  retrievedAt?: string | null;
  cacheExpiresAt?: string | null;
  lexicalScore?: number;
  semanticScore?: number;
  fusedScore?: number;
};

export type RetrievedClaim = {
  kind: "claim";
  id: string;
  claimId: string;
  text: string;
  claimKind: string;
  certainty: string;
  approvalOrigin: string;
  evidenceType: string;
  personalityId?: string;
  personalityName?: string;
  parameterName: string | null;
  fieldLabel: string | null;
  sourceTitle: string | null;
  sourceAuthor: string | null;
  sourceInstitution: string | null;
  sourceUrl: string | null;
  pageOrSection: string | null;
  evidenceExcerpt: string | null;
  chunkId: string | null;
  textualLayer: string | null;
  fusedScore?: number;
};

export type RetrievedEvidence = RetrievedPassage | RetrievedClaim;

export type Citation = {
  id: string;
  kind: "approved_claim" | "approved_source_passage";
  claimId?: string;
  chunkId?: string;
  sourceId?: string;
  title: string;
  author: string | null;
  institution: string | null;
  url: string | null;
  pageOrSection: string | null;
  textualLayer: string | null;
  retrievedAt?: string | null;
  excerpt: string;
  personalityId?: string;
  personalityName?: string;
  approvalOrigin?: string;
  evidenceType?: string;
};

export type RetrievalDebug = {
  executionMode: "FAST" | "EXPANDED" | "RESEARCH";
  routingStrategy: "deterministic" | "broad" | "model";
  selectedPersonality: string;
  selectedPersonalityId?: string;
  selectedPersonalities?: Array<{ id: string; name: string }>;
  evidencePolicyMode?: "test" | "strict";
  comparisonMode?: boolean;
  selectedParameters: Array<{ code: string; name: string }>;
  lexicalResults: number;
  semanticResults: number;
  approvedClaimResults: number;
  totalApprovedClaimsForPersonality: number;
  approvedClaimsBeforeParameterFilter: number;
  approvedClaimsAfterParameterFilter: number;
  totalChunksForPersonality: number;
  chunksBeforeParameterFilter: number;
  chunksAfterParameterFilter: number;
  embeddingCountForPersonality: number;
  approvedLiveSourceCount: number;
  cacheResults: number;
  localEvidenceSufficient: boolean;
  localEvidenceCoverage?: number;
  localEvidenceSufficiencyReason?: string;
  liveResearchTriggered: boolean;
  approvedSourcesConsidered: string[];
  liveUrlsAccepted: string[];
  liveUrlsRejected: Array<{ url: string; reason: string }>;
  liveFetches: number;
  cacheHits: number;
  liveResearchSkipReason: "LOCAL_EVIDENCE_SUFFICIENT" | "NO_APPROVED_LIVE_SOURCES" | "NO_APPROVED_URLS_DISCOVERED" | "LIVE_FETCH_FAILED" | null;
  lexicalError: string | null;
  semanticError: string | null;
  claimRetrievalError: string | null;
  mergedCandidates: number;
  rerankedEvidence: string[];
  finalSelectedEvidenceCount: number;
  semanticFallbackReason: string | null;
  generationFallbackReason?: string | null;
  latenciesMs: Record<string, number>;
};

export type IngestionInput = {
  sourceId: string;
  personalityIds: string[];
  parameterFieldIds?: string[];
  textualLayer?: string | null;
  language?: string | null;
  sections: DocumentSection[];
};
