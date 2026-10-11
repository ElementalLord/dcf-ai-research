/**
 * A lens is one angle on a person's work. Lenses steer retrieval, evidence
 * selection, live search, and synthesis; they are not display-only tags.
 */
export type LensId = "scientific" | "educational" | "institutional" | "national" | "social" | "political" | "military"
  | "administrative" | "economic" | "cultural" | "philosophical" | "spiritual" | "literary" | "environmental";

export type Lens = {
  id: LensId;
  label: string;
  /** Words in a question that name this angle. */
  ask: RegExp;
  /** Words in evidence that show it speaks to this angle. */
  evidence: RegExp;
  /** What the angle covers, phrased for the synthesis and search prompts. */
  focus: string;
  /** A few plain terms added to local retrieval so matching evidence surfaces. */
  retrievalTerms: string[];
};

export const LENSES: Lens[] = [
  { id: "scientific", label: "Scientific", ask: /\bscientific(?:ally)?\b|\bscience\b|\bas a scientist\b/i,
    evidence: /discover|experiment|theor|research|physic|mathemat|spectr|scatter|formula|proof|laborator|observ|measure|scien/i,
    focus: "discoveries, methods, experiments, and their effect on the field", retrievalTerms: ["discovery", "experiment", "research", "science"] },
  { id: "educational", label: "Educational", ask: /\beducation(?:al|ally)?\b|\bteaching\b|\bpedagog\w*\b|\bas an? (?:educator|teacher)\b/i,
    evidence: /educat|school|universit|college|student|teach|taught|curricul|pedagog|learning|mentor|lectur|train/i,
    focus: "teaching, mentorship, schools or universities, and ideas about education", retrievalTerms: ["education", "students", "teaching", "mentor"] },
  { id: "institutional", label: "Institutional", ask: /\binstitution(?:al|ally|s)?\b|\binstitution[- ]building\b|\borgani[sz]ational\b/i,
    evidence: /found(?:ed|ing|er)|establish|institut|academy|society|mission|organi[sz]|laborator|director|journal|department|association/i,
    focus: "organizations founded, led, or shaped, and how they outlasted the person", retrievalTerms: ["founded", "institute", "established", "organization"] },
  { id: "national", label: "National development", ask: /\bnational development\b|\bnation[- ]building\b|\bnationalis[mt]\b|\bfor (?:india|the nation|the country)\b/i,
    evidence: /nation|india|independen|self[- ]relian|development|swadeshi|country/i,
    focus: "contribution to the country's development, self-reliance, or national life", retrievalTerms: ["national", "India", "development"] },
  { id: "social", label: "Social", ask: /\bsocial(?:ly)?\b|\bsociety\b/i,
    evidence: /social|society|reform|caste|women|poor|poverty|welfare|service|communit|equalit|uplift|people|masses/i,
    focus: "effects on society, reform, service, and ordinary people's lives", retrievalTerms: ["social", "society", "reform", "service"] },
  { id: "political", label: "Political", ask: /\bpolitic(?:al|ally|s)\b/i,
    evidence: /politic|state|kingdom|empire|sovereign|coronation|swaraj|alliance|treaty|diploma|rule[rd]?\b|nationalis|independen|colonial|government|power/i,
    focus: "power, statecraft, alliances, sovereignty, and political consequences", retrievalTerms: ["political", "state", "sovereignty", "diplomacy"] },
  { id: "military", label: "Military", ask: /\bmilitar(?:y|ily)\b|\bwarfare\b|\bnaval\b/i,
    evidence: /military|army|navy|naval|fort|battle|campaign|guerrilla|cavalry|war(?:fare)?\b|siege|commander/i,
    focus: "campaigns, strategy, forts, forces, and military organization", retrievalTerms: ["military", "army", "forts", "campaign"] },
  { id: "administrative", label: "Administrative", ask: /\badministrat(?:ive|ively|ion|or)\b|\bgovernance\b/i,
    evidence: /administrat|govern|council|minister|pradhan|revenue|tax|land|justice|law|official|bureaucra|policy/i,
    focus: "how government was organized: councils, revenue, law, and officials", retrievalTerms: ["administration", "governance", "revenue", "council"] },
  { id: "economic", label: "Economic", ask: /\beconom(?:ic|ical|ically|y)\b/i,
    evidence: /econom|trade|revenue|tax|commerce|industr|agricultur|wealth|fund|financ|market/i,
    focus: "trade, revenue, livelihoods, funding, and economic consequences", retrievalTerms: ["economy", "trade", "revenue"] },
  { id: "cultural", label: "Cultural", ask: /\bcultur(?:al|ally|e)\b/i,
    evidence: /cultur|\bart|music|language|literature|tradition|heritage|festival|identity|temple|poet/i,
    focus: "language, arts, tradition, identity, and cultural memory", retrievalTerms: ["culture", "tradition", "language", "heritage"] },
  { id: "philosophical", label: "Philosophical", ask: /\bphilosoph(?:ical|ically|y)\b/i,
    evidence: /philosoph|vedanta|metaphys|ethic|dharma|doctrine|idea|thought|concept|reason|truth/i,
    focus: "ideas, arguments, and the schools of thought they belong to", retrievalTerms: ["philosophy", "ideas", "thought"] },
  { id: "spiritual", label: "Spiritual", ask: /\bspiritual(?:ly|ity)?\b|\breligio(?:us|n)\b/i,
    evidence: /spiritual|religio|yoga|vedanta|monk|ascetic|tapas|sadhana|devotion|meditat|\bgod|divine|ritual|mantra/i,
    focus: "teachings, practice, lineage, and religious significance", retrievalTerms: ["spiritual", "teachings", "practice", "religion"] },
  { id: "literary", label: "Literary", ask: /\blitera(?:ry|ture)\b|\bpoet(?:ic|ry)\b|\btextual\b/i,
    evidence: /poem|poet|novel|literar|writing|wrote|composed|hymn|verse|song|prose|translat|text/i,
    focus: "texts composed or attributed, their form, and their literary influence", retrievalTerms: ["hymns", "texts", "composed", "literature"] },
  { id: "environmental", label: "Environmental", ask: /\benvironment(?:al|ally)?\b|\becolog(?:y|ical)\b/i,
    evidence: /environment|ecolog|nature|forest|river|water|climate|conservation|sustainab|agricultur|natural/i,
    focus: "relationship to nature, land, water, and environmental thinking", retrievalTerms: ["environment", "nature", "forest", "water"] },
];

const BY_ID = new Map(LENSES.map((lens) => [lens.id, lens]));
export function lensById(id: string | null | undefined): Lens | null {
  return (id && BY_ID.get(id as LensId)) || null;
}

/** Words that mark a question as asking for an angle rather than merely using an adjective. */
const FRAMING = /\b(?:angle|lens|perspective|standpoint|viewpoint|point of view|side|impact|influen\w+|contribution|contributions|significance|relevance|role|legacy|importance|achievements?|reforms?|innovati\w+|dimension|aspect)\b/i;
const ADVERB = /\b(?:scientifically|educationally|institutionally|socially|politically|militarily|administratively|economically|culturally|philosophically|spiritually|environmentally)\b/i;

/** The single angle a question asks for, or null when it asks generally. */
export function detectLens(question: string): Lens | null {
  if (!FRAMING.test(question) && !ADVERB.test(question)) return null;
  const matches = LENSES.filter((lens) => lens.ask.test(question));
  // Two named angles is a general question about both; combine rather than pick one.
  return matches.length === 1 ? matches[0] : null;
}

const CATEGORY_LENSES: Record<string, LensId[]> = {
  scientist: ["scientific", "educational", "institutional", "national"],
  political_leader: ["political", "military", "administrative", "social", "cultural"],
  ruler: ["political", "military", "administrative", "social", "cultural"],
  spiritual_teacher: ["spiritual", "educational", "social", "cultural", "institutional"],
  rishi: ["spiritual", "philosophical", "literary", "social"],
};
const DEFAULT_LENSES: LensId[] = ["social", "cultural", "educational"];

/** Angles worth offering for a person, from their research categories. Never the whole list. */
export function relevantLenses(categorySlugs: Array<string | null | undefined>, limit = 6): Lens[] {
  const ids = categorySlugs.flatMap((slug) => (slug && CATEGORY_LENSES[slug]) || []);
  return [...new Set(ids.length ? ids : DEFAULT_LENSES)].slice(0, limit).map((id) => BY_ID.get(id)!);
}

/** Lens framing words carry no subject matter, so they must not count as concepts the evidence has to cover. */
export const LENS_FRAMING_TERMS = ["angle", "lens", "perspective", "standpoint", "viewpoint", "side", "impact", "dimension", "aspect", "relevance"];
