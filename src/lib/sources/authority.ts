/**
 * Source authority answers one question: who published this, and how much
 * standing does that publisher have? It is deliberately separate from claim
 * certainty (claim_epistemics). An authoritative publisher can still print an
 * interpretation, and a primary source can still be partial.
 */
export type SourceAuthority = "authoritative" | "credible_secondary" | "general_web";

export type AuthorityRule = { domain: string; status: string; category: string };

export type AuthorityInput = {
  url?: string | null;
  sourceType?: string | null;
  /** Publisher or institution as recorded on a reviewed Library source. */
  institution?: string | null;
  /** Found by live web research for this question, not stored in the DCF Library. */
  live?: boolean;
};

export type AuthorityAssessment = {
  level: SourceAuthority;
  /** Original text, speech, letter, or document. A kind of material, not a level of trust. */
  primary: boolean;
  /** Short plain-language reason a reader can check. */
  basis: string;
};

/** Registry categories an administrator can assign to a domain. */
export const SOURCE_CLASSES: Array<{ value: string; label: string; level: SourceAuthority }> = [
  { value: "university", label: "University", level: "authoritative" },
  { value: "university_press", label: "University press", level: "authoritative" },
  { value: "government", label: "Government body or archive", level: "authoritative" },
  { value: "national_library", label: "National library", level: "authoritative" },
  { value: "archive", label: "Official or historical archive", level: "authoritative" },
  { value: "research_institute", label: "Research institute or academy", level: "authoritative" },
  { value: "peer_reviewed_publisher", label: "Peer-reviewed publisher", level: "authoritative" },
  { value: "journal_platform", label: "Academic journal platform", level: "authoritative" },
  { value: "primary_text", label: "Primary-text repository", level: "authoritative" },
  { value: "museum", label: "Museum", level: "credible_secondary" },
  { value: "cultural_institution", label: "Cultural institution", level: "credible_secondary" },
  { value: "reference_work", label: "Reference work", level: "credible_secondary" },
  { value: "institutional", label: "Institution (general)", level: "credible_secondary" },
  { value: "other", label: "Other", level: "credible_secondary" },
];

export const AUTHORITY_LABELS: Record<SourceAuthority, string> = {
  authoritative: "Authoritative source",
  credible_secondary: "Credible secondary source",
  general_web: "General web source",
};

export const AUTHORITY_HELP: Record<SourceAuthority, string> = {
  authoritative: "Published by a government body, university, peer-reviewed publisher, official archive, or recognized research institute.",
  credible_secondary: "An established reference, cultural institution, or scholarly work that explains or summarizes the record.",
  general_web: "It comes from outside DCF's preferred institutions, so read it with a little more care.",
};

export const PRIMARY_SOURCE_HELP = "Original material such as a text, speech, letter, or document. It shows what was said or written, and can still reflect its author's point of view.";
export const AUTHORITY_CAVEAT = "The label above describes who published this source. It does not by itself settle how certain each statement is.";

const RANK: Record<SourceAuthority, number> = { authoritative: 3, credible_secondary: 2, general_web: 1 };
export function authorityRank(level: SourceAuthority | null | undefined): number {
  return level ? RANK[level] : 0;
}

const GOVERNMENT_HOST = /(?:^|\.)(?:gov|mil|gov\.[a-z]{2}|nic\.in|gc\.ca|gouv\.fr|europa\.eu)$/i;
const UNIVERSITY_HOST = /(?:^|\.)(?:edu|edu\.[a-z]{2}|ac\.[a-z]{2}|uni-[a-z-]+\.de|ernet\.in)$/i;
const RESEARCH_HOST = /(?:^|\.)(?:res\.in|cnrs\.fr|mpg\.de|cern\.ch)$/i;

/** Recognized institutions outside the generic government and university suffixes. */
const AUTHORITATIVE_HOSTS: Array<[RegExp, string]> = [
  [/(?:^|\.)(?:jstor\.org|muse\.jhu\.edu|sciencedirect\.com|pubmed\.ncbi\.nlm\.nih\.gov|projecteuclid\.org|ams\.org)$/i, "Academic journal platform"],
  [/(?:^|\.)(?:cambridge\.org|oup\.com|oxfordacademic\.com|press\.uchicago\.edu|journals\.uchicago\.edu|hup\.harvard\.edu|press\.princeton\.edu|yalebooks\.yale\.edu|mitpress\.mit\.edu|sunypress\.edu|ucpress\.edu|cup\.columbia\.edu)$/i, "University press"],
  [/(?:^|\.)(?:springer\.com|nature\.com|wiley\.com|tandfonline\.com|sagepub\.com|brill\.com|degruyter\.com|royalsocietypublishing\.org|aps\.org|iop\.org|pnas\.org|science\.org|elsevier\.com)$/i, "Peer-reviewed publisher"],
  [/(?:^|\.)(?:nobelprize\.org|royalsociety\.org|insa\.nic\.in|ias\.ac\.in|bori\.ac\.in|asiaticsociety\.org\.in|lms\.ac\.uk|si\.edu)$/i, "Recognized research institute or academy"],
  [/(?:^|\.)(?:loc\.gov|bl\.uk|nationalarchives\.gov\.uk|nationalarchives\.nic\.in|abhilekh-patal\.in|indianculture\.gov\.in|ndl\.gov\.in|europeana\.eu|bnf\.fr)$/i, "National library or official archive"],
  [/(?:^|\.)(?:gretil\.sub\.uni-goettingen\.de|sanskrit\.inria\.fr|vedicheritage\.gov\.in|ignca\.gov\.in|perseus\.tufts\.edu)$/i, "Institutional primary-text repository"],
];

const CREDIBLE_HOSTS: Array<[RegExp, string]> = [
  [/(?:^|\.)(?:britannica\.com|encyclopedia\.com|oxfordreference\.com|iep\.utm\.edu|worldhistory\.org)$/i, "Established reference work"],
  [/(?:^|\.)(?:archive\.org|hathitrust\.org|gutenberg\.org|wikisource\.org)$/i, "Digital library of published works"],
  [/(?:^|\.)(?:belurmath\.org|sriaurobindoashram\.org|advaitaashrama\.org|visvabharati\.ac\.in|tagoreweb\.in)$/i, "Institution that preserves this figure's works"],
  [/(?:^|\.)(?:britishmuseum\.org|metmuseum\.org|vam\.ac\.uk|nationalmuseumindia\.gov\.in|csmvs\.in)$/i, "Museum"],
];

const AUTHORITATIVE_NAME = /\b(?:universit(?:y|ies)|college|government|ministry|department of|president of india|press information bureau|national (?:archives?|library)|academy of sciences|royal society|research (?:institute|organisation|organization|cent(?:re|er))|institute of (?:science|technology)|iit\b|indian institute|gazetteers?|nobelprize|ignca)\b/i;
const CREDIBLE_NAME = /\b(?:museum|library|foundation|society|mission|math\b|ashram|trust|encyclop|press|publishers?|books)\b/i;

function hostOf(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  try { return new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; }
}

function ruleFor(host: string, rules: AuthorityRule[]): AuthorityRule | null {
  const site = (rule: AuthorityRule) => rule.domain.replace(/^www\./, "");
  return rules.filter((rule) => rule.status === "allowed" && (host === site(rule) || host.endsWith(`.${site(rule)}`)))
    .sort((a, b) => b.domain.length - a.domain.length)[0] || null;
}

function hostAuthority(host: string): { level: SourceAuthority; basis: string } | null {
  if (GOVERNMENT_HOST.test(host)) return { level: "authoritative", basis: "Government website" };
  for (const [pattern, basis] of AUTHORITATIVE_HOSTS) if (pattern.test(host)) return { level: "authoritative", basis };
  for (const [pattern, basis] of CREDIBLE_HOSTS) if (pattern.test(host)) return { level: "credible_secondary", basis };
  if (UNIVERSITY_HOST.test(host)) return { level: "authoritative", basis: "University website" };
  if (RESEARCH_HOST.test(host)) return { level: "authoritative", basis: "Research institute website" };
  return null;
}

/** Classify one source. Administrator rules win, then the publisher's website, then reviewed Library metadata. */
export function classifySourceAuthority(input: AuthorityInput, rules: AuthorityRule[] = []): AuthorityAssessment {
  const type = (input.sourceType || "").toLowerCase();
  const primary = /primary/.test(type);
  const host = hostOf(input.url);
  const rule = host ? ruleFor(host, rules) : null;
  if (rule?.category === "trusted") return { level: "authoritative", primary, basis: "Marked trusted by a DCF administrator" };
  const ruleClass = rule ? SOURCE_CLASSES.find((entry) => entry.value === rule.category) : null;
  if (ruleClass?.level === "authoritative") return { level: "authoritative", primary: primary || ruleClass.value === "primary_text", basis: `${ruleClass.label} (set by a DCF administrator)` };
  const fromHost = host ? hostAuthority(host) : null;
  if (fromHost?.level === "authoritative") return { ...fromHost, primary };
  if (!input.live && input.institution && AUTHORITATIVE_NAME.test(input.institution)) return { level: "authoritative", primary, basis: `Published by ${input.institution}` };
  if (fromHost) return { ...fromHost, primary };
  if (rule) return { level: "credible_secondary", primary, basis: `${ruleClass?.label || "Website"} allowed by a DCF administrator` };
  if (/scholar|academic|journal|peer/.test(type)) return { level: "credible_secondary", primary, basis: input.live ? "Scholarly publication details found on the page" : "Scholarly work reviewed for the DCF Library" };
  if (!input.live && input.institution && CREDIBLE_NAME.test(input.institution)) return { level: "credible_secondary", primary, basis: `Published by ${input.institution}` };
  if (!input.live && /institution/.test(type)) return { level: "credible_secondary", primary, basis: "Institutional publication reviewed for the DCF Library" };
  return { level: "general_web", primary, basis: input.live ? "Passed DCF's credibility checks" : "Reviewed for the DCF Library, but the publisher is not a recognized institution" };
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
  primary_text: "Original text",
  scholarly_article: "Scholarly article",
  scholarly_book: "Scholarly book",
  secondary_source: "Scholarly source",
  institutional: "Institutional publication",
  traditional_narrative: "Traditional account",
  dcf_content: "DCF publication",
};

/** Reader-facing source type. Live research categories are internal, so they read as a web page. */
export function sourceTypeName(sourceType: string | null | undefined, live = false): string {
  if (live) return "Web page";
  if (!sourceType) return "Source record";
  return SOURCE_TYPE_LABELS[sourceType] || sourceType.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}
