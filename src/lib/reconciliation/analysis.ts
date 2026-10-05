import { INTERPRETIVE_CLAIM } from "@/lib/live-research/provenance-link";
import { assessCitedPassage, inflection, matchedWords, stems, termForms, type CitedAssessment, type PassageIdentity } from "@/lib/evidence-completion/passage-match";
import type { Locator } from "@/lib/evidence-completion/locator";

/**
 * Why an approved claim with a located passage is not EXACT. Reasons are deterministic and may combine.
 * ACTUAL_NON_SUPPORT means the located passage does not carry the claim's content at all.
 */
export type ReconciliationReason = "COMPOUND_CLAIM" | "INTERPRETIVE_CLAIM" | "WORDING_MISMATCH" | "ENTITY_ONLY_MATCH" | "LOCATOR_TOO_BROAD"
  | "PARTIAL_PROPOSITION_SUPPORT" | "TRANSLATION_VARIANT" | "SOURCE_EDITION_MISMATCH" | "ACTUAL_NON_SUPPORT";

/**
 * Conservative general-English equivalence groups for older translations and modern paraphrase.
 * A match through this table is never EXACT on its own: it yields LIKELY_DIRECT_SUPPORT for a reviewer.
 * Groups hold ordinary vocabulary only; names, traditions, and technical terms do not belong here.
 */
export const EQUIVALENCE_GROUPS: string[][] = [
  ["silence", "silent", "mute", "muteness", "speechless"],
  ["lower", "bow", "bend", "stoop", "sink", "descend"],
  ["ascetic", "ascesis", "austerity", "austere", "penance", "asceticism"],
  ["withdraw", "withdrawal", "retract", "recall", "annul", "annulment", "revoke"],
  ["gift", "give", "gave", "given", "bestow", "grant", "accord", "endow"],
  ["meal", "food", "repast", "victuals"],
  ["request", "ask", "beg", "entreat", "implore", "solicit", "petition", "bid", "bidding"],
  ["cross", "crossing", "traverse", "ford", "pass", "passage"],
  ["wagon", "cart", "car", "chariot"],
  ["river", "stream", "flood", "waters"],
  ["anger", "angry", "wrath", "wroth", "fury", "rage", "ire", "enraged"],
  ["curse", "cursed", "imprecation", "malediction"],
  ["teach", "taught", "instruct", "instruction", "impart", "train", "tutor"],
  ["weapon", "missile", "arms", "astra"],
  ["kill", "slay", "slain", "slew", "destroy", "eliminate"],
  ["protect", "protection", "guard", "defend", "safeguard", "secure", "shelter"],
  ["show", "display", "exhibit", "reveal"],
  ["sacrifice", "ritual", "rite", "ceremony", "oblation"],
  ["adopt", "adopted", "adoption"],
  ["son", "sons", "offspring", "progeny", "children"],
  ["recognize", "recognise", "acknowledge", "accept", "accord"],
  ["heaven", "heavens", "paradise", "firmament"],
  ["create", "creation", "fashion", "replicate", "make"],
  ["king", "ruler", "monarch", "sovereign"],
  ["breath", "breathe", "respiration"],
  ["fast", "fasting", "starve", "abstain"],
  ["consent", "permission", "leave", "approval"],
  ["messenger", "envoy", "emissary", "courier"],
  ["hermitage", "ashram", "retreat"],
  ["smoke", "fume", "fumes", "vapour", "vapor"],
  ["distress", "startle", "startled", "perturbed", "alarm", "alarmed", "agitated", "disturbed"],
  ["cook", "cooked", "readied", "prepared", "ready"],
  ["remorse", "regret", "repent", "repentance", "ashamed", "shame"],
  ["fatigue", "weariness", "exhaustion", "tiredness"],
  ["asleep", "sleep", "sleeping", "slumber"],
  ["generosity", "generous", "liberality", "charity"],
];

/** Equivalence keys keep three-letter words ("bow", "car", "ire") that ordinary stemming drops. */
function equivalenceKeys(word: string): string[] {
  const plain = word.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return [...new Set([inflection(plain), plain].map((form) => form.slice(0, 6)).filter((form) => form.length >= 3))];
}
const GROUP_OF = new Map<string, number>();
EQUIVALENCE_GROUPS.forEach((group, index) => group.forEach((word) => { for (const key of equivalenceKeys(word)) GROUP_OF.set(key, index); }));

/** Claim words matched lexically, plus those matched only through an equivalence group. */
export function equivalenceSupport(claimText: string, passageText: string, exclude: Set<string>) {
  const claim = termForms(claimText, exclude);
  const passage = stems(passageText, exclude);
  const lexical = matchedWords(claim, passage);
  const passageGroups = new Set(passageText.split(/[^A-Za-z\u00C0-\u024F]+/).filter((word) => word.length >= 3)
    .flatMap(equivalenceKeys).map((key) => GROUP_OF.get(key)).filter((group): group is number => group != null));
  // Group lookup uses the claim's raw words: matching keys are transliteration-folded ("lower" → "lover").
  const rawByKey = new Map<string, string[]>();
  for (const word of claimText.split(/[^A-Za-z\u00C0-\u024F]+/).filter((item) => item.length >= 3)) {
    const key = [...termForms(word, exclude).keys()][0];
    if (key) rawByKey.set(key, [...(rawByKey.get(key) || []), word]);
  }
  const claimGroups = (key: string) => (rawByKey.get(key) || []).flatMap(equivalenceKeys).map((form) => GROUP_OF.get(form)).filter((group): group is number => group != null);
  const equivalent = [...claim.keys()].filter((key) => !lexical.includes(key) && claimGroups(key).some((group) => passageGroups.has(group)));
  const total = Math.max(1, claim.size);
  return { lexical, equivalent, lexicalRatio: lexical.length / total, combinedRatio: (lexical.length + equivalent.length) / total, claimWords: claim.size };
}

/** "Scholar X argues/interprets/reads ... that Y": a claim about what someone says, which a passage can state exactly. */
const ATTRIBUTION = /\b(?:[A-Z][\w.'’-]+(?:\s+[A-Z][\w.'’-]+)*)\s+(?:argues|argued|interprets|interpreted|reads|read|contends|maintains|proposes|holds|held|believes|considers|claims|suggests|writes|wrote|describes|calls)\b/;
export function isAttributional(text: string): boolean {
  return ATTRIBUTION.test(text) && !/^(?:The|This|That|These|Those|It)\s/.test(text.trim());
}

/** Statements that assert what really happened, as opposed to what a text narrates or a scholar argues. */
const HISTORICAL_ASSERTION = /\b(?:historically|historical fact|in fact|actually|in reality|really (?:was|were|happened)|did in fact)\b/i;
export function assertsHistoricalFact(text: string): boolean {
  return HISTORICAL_ASSERTION.test(text) && !isAttributional(text);
}

/** Interpretive framing around a factual core: "X shows that ...", "..., making it ...", "... can be read as ...". */
const LEADING_FRAME = /^(?:.{0,80}?\b(?:shows?|demonstrates?|suggests?|indicates?|illustrates?|reveals?|implies|confirms?|makes clear)\s+that\s+)/i;
const TRAILING_FRAME = /(?:,|;|—|–)\s*(?:making|showing|suggesting|indicating|illustrating|revealing|demonstrating|thereby|which (?:shows|makes|suggests|gives|provides|means|indicates)|so (?:that )?(?:his|her|their|the|this|it)|giving|providing|offering|presenting|turning|allowing|an? (?:\w+ ){0,3}(?:motif|image|device|marker|sign|formula|theme)\b)/i;
/** Epistemic or normative language: a statement about how to read, classify, or weigh evidence, not what a text says. */
const WHOLLY_INTERPRETIVE = new RegExp([
  "\\b(?:can|may|might|could) be (?:read|seen|understood|taken)", "\\bis best (?:read|understood)", "\\bshould\\b", "\\bmust\\b",
  "\\bcan support (?:reflection|discussion)", "\\bis (?:a|an) (?:modern|later) (?:interpretation|reading)", "\\bvalue statement",
  "\\bnot (?:an? |the )?(?:empirical|independent|literal|historical|archaeolog|biomedical|scientific|experimental|externally)\\w*",
  "\\b(?:independently|externally|experimentally|archaeologically) verified", "\\brather than\\b", "\\brequires careful",
  "\\b(?:important|significant|notable|particularly rich|defensible|valuable)\\b", "\\b(?:securely|clearly) (?:a fact|part of)",
  "^(?:This|These|Such|That) (?:is|are|was|were|makes|shows|gives|provides|difference)\\b",
].join("|"), "i");
/** An interpretive framing verb whose object is a reading, then the narrated fact: "portrays generosity ... when X gives ...". */
const FRAMED_FACT = /\b(?:portrays?|frames?|casts?|treats?|foregrounds?|emphasi[sz]es|stages?)\b.{3,80}?\b(?:even when|when|in that|by)\s+(.+)$/i;
const SUBORDINATE_FACT = /\b(?:even when|even though|even as)\s+(.+)$/i;

export type Proposition = { text: string; kind: "factual" | "interpretive" };

/**
 * Splits a claim into candidate atomic propositions without adding words: sentences and semicolon clauses,
 * then contrastive clauses (", while", ", but", ", whereas"), then a factual core separated from its
 * interpretive frame, including facts carried by a subordinate clause of an interpretive sentence.
 * Each piece keeps the approved wording verbatim.
 */
export function atomicPropositions(claimText: string): Proposition[] {
  const sentences = claimText.split(/(?<=[.;])\s+(?=[A-Z])|;\s+/).map((part) => part.trim()).filter(Boolean);
  const out: Proposition[] = [];
  for (const sentence of sentences) {
    const clauses = sentence.split(/,\s+(?=(?:while|but|whereas|and then|and later|before|after which)\s)/i).map((part) => part.trim());
    for (const clause of clauses) {
      const body = clause.replace(/^(?:while|but|whereas|and then|and later|before|after which)\s+/i, "");
      const lead = body.match(LEADING_FRAME);
      let core = lead ? body.slice(lead[0].length) : body;
      const framed = !lead ? core.match(FRAMED_FACT) : null;
      const subordinate = core.match(SUBORDINATE_FACT);
      if (subordinate) core = subordinate[1];
      else if (framed) core = framed[1];
      const tail = core.search(TRAILING_FRAME);
      const factual = (tail > 0 ? core.slice(0, tail) : core).trim().replace(/[.;]+$/, "");
      const interpretive = Boolean(lead || subordinate || tail > 0 || core !== body) || WHOLLY_INTERPRETIVE.test(body) || INTERPRETIVE_CLAIM.test(body) && !isAttributional(body);
      if (factual && !WHOLLY_INTERPRETIVE.test(factual) && !(INTERPRETIVE_CLAIM.test(factual) && !isAttributional(factual))) out.push({ text: factual, kind: "factual" });
      if (interpretive) out.push({ text: body, kind: "interpretive" });
    }
  }
  return out.filter((part) => part.text.split(/\s+/).length >= 4);
}

/** A proposal must read as a standalone claim: a named subject, sentence case, and terminal punctuation. */
export function standaloneClaim(fragment: string, subjectName: string, aliases: string[]): string | null {
  let text = fragment.trim().replace(/[,;:—–-]+$/, "").trim();
  text = text.replace(/^(?:He|She)\b/, subjectName).replace(/^(?:His|Her)\b/, `${subjectName}'s`);
  if (/^(?:They|It|This|That|These|Those|Which|Who)\b/i.test(text)) return null;
  const named = [subjectName, ...aliases].some((name) => name.length >= 3 && text.toLowerCase().includes(name.toLowerCase()))
    || /^(?:The|In|At|After|Before|When|During|According)\s/.test(text) || /^[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\s/.test(text);
  if (!named || text.split(/\s+/).length < 5) return null;
  text = text[0].toUpperCase() + text.slice(1);
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

export type ReconciliationProposal = {
  kind: "atomic_claim" | "confirm_exact";
  text: string;
  /** True when the proposal passes the EXACT policy as written; false when it relies on equivalence groups. */
  deterministic: boolean;
  basis: string;
  support: { lexical: string[]; equivalent: string[]; ratio: number };
};

export type Reconciliation = { reasons: ReconciliationReason[]; assessment: CitedAssessment; proposals: ReconciliationProposal[]; factual: number; interpretive: number;
  /** Each factual proposition's best support against this passage, so a reviewer sees why nothing was proposed. */
  scores: Array<{ text: string; level: string; ratio: number; equivalentRatio: number; reason: string; matched: string[]; locatorFit: string }> };

/**
 * Explains why EXACT failed for one claim/passage pair and proposes evidence-aligned refinements.
 * Nothing here approves anything: proposals go to human review, and the original claim is never edited.
 */
export function reconcile(input: {
  claimText: string; requested: Locator; identity: PassageIdentity; passage: { text: string; locators: Locator[] };
  exclude: Set<string>; subjectName: string; aliases: string[]; passageKind?: "primary" | "scholarly" | "other";
}): Reconciliation {
  const assessment = assessCitedPassage({ claimText: input.claimText, requested: input.requested, identity: input.identity, passage: input.passage, exclude: input.exclude });
  const parts = atomicPropositions(input.claimText);
  const factual = parts.filter((part) => part.kind === "factual");
  const reasons = new Set<ReconciliationReason>();
  if (parts.length > 1) reasons.add("COMPOUND_CLAIM");
  if (parts.some((part) => part.kind === "interpretive") || INTERPRETIVE_CLAIM.test(input.claimText) && !isAttributional(input.claimText)) reasons.add("INTERPRETIVE_CLAIM");
  if (assessment.locatorFit === "containing") reasons.add("LOCATOR_TOO_BROAD");
  if (input.identity === "alternate_edition" || input.identity === "same_catalogue_record" && input.requested.kind !== "canonical") reasons.add("SOURCE_EDITION_MISMATCH");
  if (/mostly names/i.test(assessment.reason)) reasons.add("ENTITY_ONLY_MATCH");
  // A scholar's argument cannot make an unattributed historical assertion exact.
  const historicalOverreach = input.passageKind === "scholarly" && assertsHistoricalFact(input.claimText);

  const proposals: ReconciliationProposal[] = [];
  const window = input.passage.text;
  const scores: Reconciliation["scores"] = [];
  for (const part of factual) {
    const text = standaloneClaim(part.text, input.subjectName, input.aliases);
    if (!text || (parts.length === 1 && text.replace(/\.$/, "") === input.claimText.trim().replace(/\.$/, ""))) continue;
    if (input.passageKind === "scholarly" && assertsHistoricalFact(text)) continue;
    const check = assessCitedPassage({ claimText: text, requested: input.requested, identity: input.identity, passage: input.passage, exclude: input.exclude });
    const support = equivalenceSupport(text, window, input.exclude);
    scores.push({ text, level: check.level, ratio: check.supportRatio, equivalentRatio: Number(support.combinedRatio.toFixed(2)), reason: check.reason, matched: check.matchedTerms, locatorFit: check.locatorFit });
    if (check.level === "EXACT")
      proposals.push({ kind: "atomic_claim", text, deterministic: true, basis: "The located passage supports this proposition exactly under the evidence policy",
        support: { lexical: support.lexical, equivalent: [], ratio: Number(support.lexicalRatio.toFixed(2)) } });
    else if (check.locatorFit === "exact" && support.combinedRatio >= 0.6 && support.lexical.length >= 2 && support.equivalent.length >= 1 && !INTERPRETIVE_CLAIM.test(text))
      proposals.push({ kind: "atomic_claim", text, deterministic: false, basis: "LIKELY_DIRECT_SUPPORT: located passage expresses this proposition in different (translation) wording",
        support: { lexical: support.lexical, equivalent: support.equivalent, ratio: Number(support.combinedRatio.toFixed(2)) } });
  }
  const whole = equivalenceSupport(input.claimText, window, input.exclude);
  const wholeCandidate = parts.length <= 1 && !reasons.has("INTERPRETIVE_CLAIM") && !historicalOverreach && assessment.locatorFit === "exact"
    && !reasons.has("SOURCE_EDITION_MISMATCH") && whole.combinedRatio >= 0.6 && whole.lexical.length >= 2 && whole.equivalent.length >= 1;
  if (wholeCandidate) {
    reasons.add("TRANSLATION_VARIANT");
    proposals.push({ kind: "confirm_exact", text: input.claimText, deterministic: false,
      basis: "LIKELY_DIRECT_SUPPORT: the whole claim is expressed by the located passage in different wording; a reviewer must confirm",
      support: { lexical: whole.lexical, equivalent: whole.equivalent, ratio: Number(whole.combinedRatio.toFixed(2)) } });
  }
  if (proposals.some((proposal) => proposal.kind === "atomic_claim") && parts.length > 1) reasons.add("PARTIAL_PROPOSITION_SUPPORT");
  if (proposals.some((proposal) => !proposal.deterministic) && !reasons.has("TRANSLATION_VARIANT")) reasons.add("TRANSLATION_VARIANT");
  // A purely interpretive or normative claim is not "unsupported" by a passage; it is not the kind of thing a passage states.
  if (factual.length && (!reasons.size || (!proposals.length && assessment.supportRatio < 0.5))) {
    reasons.add(assessment.supportRatio < 0.2 && whole.combinedRatio < 0.3 ? "ACTUAL_NON_SUPPORT" : "WORDING_MISMATCH");
  }
  return { reasons: [...reasons], assessment, proposals, factual: factual.length, interpretive: parts.length - factual.length, scores };
}

/**
 * Near-duplicate test for proposals against existing claims: normalized equality, or word-set Jaccard ≥ 0.8.
 * Equivalence must hold both ways, so an atomic child is not a duplicate of the broader parent that contains it.
 */
export function normalizedClaimText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
export function nearDuplicate(left: string, right: string): boolean {
  if (normalizedClaimText(left) === normalizedClaimText(right)) return true;
  const a = new Set(termForms(left).keys());
  const b = new Set(termForms(right).keys());
  const shared = [...a].filter((term) => b.has(term)).length;
  return shared / Math.max(1, new Set([...a, ...b]).size) >= 0.8 && Math.min(a.size, b.size) >= 3;
}
