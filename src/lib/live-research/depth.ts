import { contractSufficient, explainContracts, type ContractStats } from "@/lib/claim-epistemics/evaluation";
import { DEPTH_VERSION } from "@/lib/claim-epistemics/types";

export type DepthState = "EMPTY" | "THIN" | "BASIC" | "GOOD" | "DEEP" | "CONTESTED";
export type DepthParameter = {
  code: string; name: string; fieldCount: number; fieldsWithSourceChunks: number; sourceChunks: number;
  independentWorks: number; primaryWorks: number; scholarlyWorks: number; approvedClaims: number;
  contestedClaims?: number; claimsWithExactPassages: number; textualLayers: number;
  claimsWithStrongSupport?: number; coreClaims?: number; coreClaimsWithExactPassages?: number;
  /** Type-aware evidence-contract statistics; when present they replace the uniform exact-coverage floor. */
  contract?: ContractStats;
};

/**
 * Exact provenance stays the dominant signal, but it is not a single global gate: a parameter whose
 * core claims are exactly sourced, with most claims at least strongly supported, may carry a few minor
 * claims without exact links. A high strong-link count never substitutes for the exact-coverage floor.
 */
export function provenanceSufficient(area: DepthParameter): { ok: boolean; reason: string | null } {
  if (!area.approvedClaims) return { ok: true, reason: null };
  const exactRatio = area.claimsWithExactPassages / area.approvedClaims;
  if (exactRatio >= 0.7) return { ok: true, reason: null };
  const core = area.coreClaims || 0;
  const coreRatio = core ? (area.coreClaimsWithExactPassages || 0) / core : exactRatio;
  const supportedRatio = Math.max(area.claimsWithStrongSupport || 0, area.claimsWithExactPassages) / area.approvedClaims;
  if (exactRatio < 0.5) return { ok: false, reason: "Approved claims lack exact passage links" };
  if (coreRatio < 0.7) return { ok: false, reason: "Core claims lack exact passage links" };
  if (supportedRatio < 0.85) return { ok: false, reason: "Too many claims lack exact or strong passage support" };
  return { ok: true, reason: null };
}

export function evaluateDepth(parameters: DepthParameter[]) {
  const areas = parameters.map((area) => {
    const reasons: string[] = [];
    const fieldRatio = area.fieldCount ? area.fieldsWithSourceChunks / area.fieldCount : 0;
    const exactRatio = area.approvedClaims ? area.claimsWithExactPassages / area.approvedClaims : 0;
    const needsScholarship = /histor|philosoph|contest|uncertain|context|contempor/i.test(`${area.code} ${area.name}`);
    const needsPrimary = /text|contribut|narrative|vocation|relationship|lineage|tapas/i.test(`${area.code} ${area.name}`);
    if (!area.sourceChunks) reasons.push("No linked passages");
    if (fieldRatio < 0.5) reasons.push("Most parameter fields lack passages");
    if (area.independentWorks < 2) reasons.push("Fewer than two independent works");
    if (needsPrimary && !area.primaryWorks) reasons.push("Primary textual evidence missing");
    if (needsScholarship && !area.scholarlyWorks) reasons.push("Scholarly context missing");
    // Type-aware provenance: each claim is judged by its own evidence contract. Without epistemic data the
    // legacy uniform exact-coverage rule applies, and the result says so.
    const contract = area.contract ? contractSufficient(area.contract) : null;
    const legacy = area.contract ? null : provenanceSufficient(area);
    const provenance = { ok: contract ? contract.ok : legacy!.ok };
    if (contract) reasons.push(...contract.reasons); else if (legacy!.reason) reasons.push(legacy!.reason);
    const contestedUnrepresented = area.contract ? area.contract.contestedUnrepresented : area.contestedClaims || 0;
    let state: DepthState = "EMPTY";
    if (area.sourceChunks > 0) state = "THIN";
    if (area.sourceChunks >= 2 && fieldRatio >= 0.3 && area.independentWorks >= 2) state = "BASIC";
    if (area.sourceChunks >= 4 && fieldRatio >= 0.5 && area.independentWorks >= 3
      && (!needsPrimary || area.primaryWorks > 0) && (!needsScholarship || area.scholarlyWorks > 0)
      && provenance.ok) state = "GOOD";
    const deepEvidence = area.contract
      ? (!area.contract.evidentiary || area.contract.satisfied / area.contract.evidentiary >= 0.9) && (!area.contract.direct || area.contract.directSatisfied / area.contract.direct >= 0.9)
      : (!area.approvedClaims || exactRatio >= 0.9);
    if (state === "GOOD" && area.sourceChunks >= 8 && fieldRatio >= 0.75 && area.independentWorks >= 4
      && area.primaryWorks > 0 && area.scholarlyWorks > 0 && area.textualLayers >= 2 && deepEvidence) state = "DEEP";
    // Contested depth measures whether disagreement is represented, not whether one side won.
    if (contestedUnrepresented > 0 && (area.scholarlyWorks < 2 || !provenance.ok)) {
      state = "CONTESTED";
      reasons.push("Contested claims need independent scholarship and exact passage support");
    }
    const importance = /identity|vocation|text|contribut|relationship|tapas|philosoph|histor|contest/i.test(`${area.code} ${area.name}`) ? 2 : 1;
    const explanation = [...(area.contract ? explainContracts(area.contract) : [`${area.claimsWithExactPassages}/${area.approvedClaims} claims have exact passages (legacy uniform rule)`]),
      `${area.independentWorks} independent works (${area.primaryWorks} primary, ${area.scholarlyWorks} scholarly), ${area.textualLayers} textual layers`];
    return { code: area.code, name: area.name, state, reasons, importance, explanation, depthVersion: area.contract ? DEPTH_VERSION : "depth/1-uniform-exact",
      independentWorks: area.independentWorks, primaryWorks: area.primaryWorks, scholarlyWorks: area.scholarlyWorks };
  });
  const major = areas.filter((area) => area.importance === 2);
  const sufficient = major.length > 0 && major.every((area) => area.state === "GOOD" || area.state === "DEEP")
    && areas.every((area) => area.state !== "EMPTY" && area.state !== "THIN");
  const overall: DepthState = sufficient ? (major.every((area) => area.state === "DEEP") ? "DEEP" : "GOOD")
    : areas.some((area) => area.state === "GOOD" || area.state === "DEEP") ? "BASIC" : "THIN";
  return { overall, sufficient, areas, weakAreas: [...areas].filter((area) => area.state !== "DEEP").sort((a, b) =>
    b.importance - a.importance || ["EMPTY", "THIN", "BASIC", "GOOD"].indexOf(a.state) - ["EMPTY", "THIN", "BASIC", "GOOD"].indexOf(b.state)).slice(0, 5) };
}
