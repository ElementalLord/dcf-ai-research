export type CoverageParameterInput = {
  id: string;
  code: string;
  name: string;
  fields: Array<{ id: string; code: string; label: string }>;
};

export type CoverageClaimInput = {
  id: string;
  parameterFieldId: string | null;
  approved: boolean;
  hasChunkEvidence: boolean;
  sourceIds: string[];
};

export type CoverageChunkInput = {
  id: string;
  sourceId: string;
  parameterFieldIds: string[];
  embedded: boolean;
  textualLayer: string | null;
};

export function percentage(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Number(((numerator / denominator) * 100).toFixed(1));
}

export function computeCorpusCoverage(input: {
  parameters: CoverageParameterInput[];
  claims: CoverageClaimInput[];
  chunks: CoverageChunkInput[];
  sourceCount: number;
  events: number;
  relationships: number;
  cachedPages: number;
  approvedSourceScopes: number;
}) {
  const approvedClaims = input.claims.filter((claim) => claim.approved);
  const claimsWithChunks = approvedClaims.filter((claim) => claim.hasChunkEvidence);
  const embeddedChunks = input.chunks.filter((chunk) => chunk.embedded);
  const layers = new Set(input.chunks.map((chunk) => chunk.textualLayer).filter(Boolean));

  const parameters = input.parameters.map((parameter) => {
    const fieldIds = new Set(parameter.fields.map((field) => field.id));
    const parameterClaims = approvedClaims.filter((claim) => claim.parameterFieldId && fieldIds.has(claim.parameterFieldId));
    const parameterChunks = input.chunks.filter((chunk) => chunk.parameterFieldIds.some((fieldId) => fieldIds.has(fieldId)));
    const fieldsWithClaims = new Set(parameterClaims.map((claim) => claim.parameterFieldId).filter(Boolean));
    const fieldsWithChunks = new Set(parameterChunks.flatMap((chunk) => chunk.parameterFieldIds).filter((fieldId) => fieldIds.has(fieldId)));
    const evidenceSources = new Set([
      ...parameterClaims.flatMap((claim) => claim.sourceIds),
      ...parameterChunks.map((chunk) => chunk.sourceId),
    ]);
    const parameterLayers = new Set(parameterChunks.map((chunk) => chunk.textualLayer).filter(Boolean));
    return {
      id: parameter.id,
      code: parameter.code,
      name: parameter.name,
      fieldCount: parameter.fields.length,
      fieldsWithApprovedClaims: fieldsWithClaims.size,
      fieldsWithSourceChunks: fieldsWithChunks.size,
      approvedClaims: parameterClaims.length,
      claimsWithExactPassages: parameterClaims.filter((claim) => claim.hasChunkEvidence).length,
      exactPassageCoveragePercent: percentage(parameterClaims.filter((claim) => claim.hasChunkEvidence).length, parameterClaims.length),
      uniqueEvidenceSources: evidenceSources.size,
      textualLayers: parameterLayers.size,
      sourceChunks: parameterChunks.length,
      embeddedChunks: parameterChunks.filter((chunk) => chunk.embedded).length,
      independentEvidence: evidenceSources.size >= 2,
    };
  });

  return {
    overall: {
      sources: input.sourceCount,
      chunks: input.chunks.length,
      embeddedChunks: embeddedChunks.length,
      parameterTaggedChunks: input.chunks.filter((chunk) => chunk.parameterFieldIds.length > 0).length,
      approvedClaims: approvedClaims.length,
      claimsWithExactPassages: claimsWithChunks.length,
      exactPassageCoveragePercent: percentage(claimsWithChunks.length, approvedClaims.length),
      textualLayers: layers.size,
      events: input.events,
      relationships: input.relationships,
      cachedApprovedPages: input.cachedPages,
      approvedSourceScopes: input.approvedSourceScopes,
    },
    parameters,
    disclaimer: "Corpus coverage measures evidence depth and provenance; it does not establish scholarly or historical completeness.",
  };
}
