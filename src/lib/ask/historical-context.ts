/** What kind of historical placement a question asks for, if any. */
export type ContextIntent = "contemporaries" | "novelty" | "period";

const CONTEMPORARIES = /\b(?:who else|anyone else|someone else|contemporar\w+|peers?|same (?:field|period|era|time)|similar work|related (?:physics|work|research|field|problems?|questions?|experiments?)|competing|rival (?:schools?|theor\w+|approach\w*)|who influenced|influenced whom)\b/i;
const NOVELTY = /\b(?:groundbreaking|ahead of (?:his|her|their|its|the) (?:time|peers)|unusual|innovative|novel|for (?:the|its|that|his|her|their) (?:time|period|era|day)|at (?:the|that) time|existed before|came before|what changed)\b/i;
const PERIOD = /\b(?:what was happening|what was going on|historical (?:context|period|background|setting)|in (?:his|her|their) (?:time|day|era)|during (?:his|her|their) (?:time|life|lifetime|era)|what (?:year|period|era|century))\b/i;

export function detectContextIntent(question: string): ContextIntent | null {
  if (CONTEMPORARIES.test(question)) return "contemporaries";
  if (PERIOD.test(question)) return "period";
  if (NOVELTY.test(question)) return "novelty";
  return null;
}

/** Evidence that locates something in time or against other work. */
export const CONTEXT_EVIDENCE = /\b(?:1[0-9]\d{2}|20\d{2}|\d{1,2}(?:st|nd|rd|th)[- ]century|centur(?:y|ies)|era|period|reign|colonial|mughal|british rule|vedic|contemporar\w+|at the time|earlier|previously|until then|predecessors?|successors?|independently|peers?|rivals?|influenced)\b/i;

/** Evidence about the wider setting. A bare year does not say what was happening around the person. */
export const PERIOD_EVIDENCE = /\b(?:colonial|british|empire|raj|mughal|sultanate|reform\w*|movements?|nationalis\w+|centur(?:y|ies)|era|at the time|contemporar\w+|society|famine|independence|renaissance)\b/i;

/** One focused instruction for live search, so a context gap is filled in a single query. */
export const CONTEXT_SEARCH_FOCUS: Record<ContextIntent, string> = {
  contemporaries: "Identify contemporaries or competing approaches in the same field and period, and how this work compared with theirs.",
  novelty: "Explain the state of the field just before this work, with years, and what changed afterward.",
  period: "Describe the historical period, with years, and what was happening in the field and in society at the time.",
};

export const CONTEXT_GAP: Record<ContextIntent, string> = {
  contemporaries: "contemporary comparable work",
  novelty: "state of the field before and after",
  period: "historical period and setting",
};

/** Framing words for time carry no subject matter of their own. */
export const CONTEXT_FRAMING_TERMS = ["time", "period", "era", "happening", "else", "doing", "groundbreaking", "innovative", "unusual", "contemporary", "contemporaries", "peer", "peers", "related", "problem", "problems", "similar", "working"];

/** Ancient and traditional figures have no agreed dates; say so instead of inventing them. */
export function chronologyGuidance(categorySlugs: Array<string | null | undefined>): string {
  return categorySlugs.includes("rishi")
    ? "Chronology for this figure is uncertain. Do not give exact years or centuries unless a cited source states them as a scholarly estimate. Place the figure by broad period and textual layer instead, for example Rigvedic hymns, epic narrative, or later Puranic tradition."
    : "";
}
