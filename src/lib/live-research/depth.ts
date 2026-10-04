export type DepthState = "EMPTY" | "THIN" | "BASIC" | "GOOD" | "DEEP" | "CONTESTED";
export type DepthParameter = {
  code: string; name: string; fieldCount: number; fieldsWithSourceChunks: number; sourceChunks: number;
  independentWorks: number; primaryWorks: number; scholarlyWorks: number; approvedClaims: number;
  contestedClaims?: number; claimsWithExactPassages: number; textualLayers: number;
};

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
    if (area.approvedClaims && exactRatio < 0.7) reasons.push("Approved claims lack exact passage links");
    let state: DepthState = "EMPTY";
    if (area.sourceChunks > 0) state = "THIN";
    if (area.sourceChunks >= 2 && fieldRatio >= 0.3 && area.independentWorks >= 2) state = "BASIC";
    if (area.sourceChunks >= 4 && fieldRatio >= 0.5 && area.independentWorks >= 3
      && (!needsPrimary || area.primaryWorks > 0) && (!needsScholarship || area.scholarlyWorks > 0)
      && (!area.approvedClaims || exactRatio >= 0.7)) state = "GOOD";
    if (state === "GOOD" && area.sourceChunks >= 8 && fieldRatio >= 0.75 && area.independentWorks >= 4
      && area.primaryWorks > 0 && area.scholarlyWorks > 0 && area.textualLayers >= 2
      && (!area.approvedClaims || exactRatio >= 0.9)) state = "DEEP";
    if ((area.contestedClaims || 0) > 0 && (area.scholarlyWorks < 2 || exactRatio < 0.7)) {
      state = "CONTESTED";
      reasons.push("Contested claims need independent scholarship and exact passage support");
    }
    const importance = /identity|vocation|text|contribut|relationship|tapas|philosoph|histor|contest/i.test(`${area.code} ${area.name}`) ? 2 : 1;
    return { code: area.code, name: area.name, state, reasons, importance,
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
