import { describe, expect, it } from "vitest";
import { detectLens, relevantLenses } from "@/lib/ask/lenses";
import { chronologyGuidance, detectContextIntent } from "@/lib/ask/historical-context";
import { classifySourceAuthority } from "@/lib/sources/authority";
import { prioritizeEvidence } from "@/lib/ask/evidence-priority";
import { assessEvidenceSufficiency } from "@/lib/live-research/sufficiency";
import { resolveQuestionContext } from "@/lib/ask/query-context";
import { buildSynthesisPrompt } from "@/lib/corpus/synthesis-prompt";
import { buildBoundedContext } from "@/lib/corpus/context";
import { citationAuthority } from "@/lib/ask/presentation";
import { abstentionMessage } from "@/lib/ask/messages";
import { canonicalizeQuestion } from "@/lib/corpus/personality-config";
import type { RetrievedClaim, RetrievedPassage } from "@/lib/corpus/types";

const claim = (id: number, text: string, extra: Partial<RetrievedClaim> = {}): RetrievedClaim => ({
  kind: "claim", id: `claim:${id}`, claimId: String(id), text, claimKind: "historical", certainty: "high", approvalOrigin: "human_manual", evidenceType: "documented",
  parameterName: null, fieldLabel: null, sourceTitle: `Source ${id}`, sourceAuthor: null, sourceInstitution: null, sourceUrl: null, sourceType: null,
  pageOrSection: null, evidenceExcerpt: null, chunkId: null, textualLayer: null, ...extra,
});
const live = (id: number, url: string, text = "Raman studied light scattering."): RetrievedPassage => ({
  kind: "passage", id: `google:${id}`, chunkId: `google:${id}`, sourceId: `google:${id}`, text, sectionTitle: null, pageOrSection: null, textualLayer: null,
  sourceTitle: `Page ${id}`, sourceAuthor: null, sourceInstitution: new URL(url).hostname, sourceUrl: url, sourceType: "institutional", sourceStatus: "discovered", origin: "google_grounding", lexicalScore: 1,
});

describe("lenses", () => {
  it("detects the angle a question asks for", () => {
    expect(detectLens("Explain Raman from a scientific angle.")?.id).toBe("scientific");
    expect(detectLens("How was Tagore influential socially?")?.id).toBe("social");
    expect(detectLens("What was Shivaji's administrative impact?")?.id).toBe("administrative");
    expect(detectLens("What is the environmental relevance of this person's work?")?.id).toBe("environmental");
    expect(detectLens("What about the political angle?")?.id).toBe("political");
    expect(detectLens("Explain his institutional impact.")?.id).toBe("institutional");
    expect(detectLens("What was her gender significance?")?.id).toBe("gender");
    expect(detectLens("Why was her career significant for women in classical music?")?.id).toBe("gender");
    expect(detectLens("What was her international influence?")?.id).toBe("international");
    expect(detectLens("How did her historical reputation develop?")?.id).toBe("cultural");
    expect(detectLens("What was her legacy?")?.id).toBe("cultural");
    expect(detectLens("What was his agricultural impact?")?.id).toBe("agricultural");
    expect(detectLens("What was his technological contribution?")?.id).toBe("technological");
    expect(detectLens("Explain his leadership style.")?.id).toBe("leadership");
    expect(detectLens("What was his rural development impact?")?.id).toBe("rural_development");
    expect(detectLens("What is his textual significance?")?.id).toBe("textual");
    expect(detectLens("What is his historical significance?")?.id).toBe("historical");
  });

  it("answers generally when no single angle is requested", () => {
    expect(detectLens("Who was C. V. Raman?")).toBeNull();
    expect(detectLens("What scientific instruments did Raman use?")).toBeNull();
    expect(detectLens("Compare his political and military impact.")).toBeNull();
  });

  it("offers only the angles that suit a person's field", () => {
    expect(relevantLenses(["scientist"]).map((lens) => lens.id)).toEqual(["scientific", "educational", "institutional", "national"]);
    expect(relevantLenses(["political_leader"]).map((lens) => lens.id)).toContain("administrative");
    expect(relevantLenses(["political_leader"]).map((lens) => lens.id)).not.toContain("scientific");
    expect(relevantLenses(["scientist", "political_leader"]).length).toBeLessThanOrEqual(7);
    expect(relevantLenses(["musician_performer"]).map((lens) => lens.id)).toEqual(["artistic", "cultural", "social", "gender", "institutional", "spiritual", "international"]);
    expect(relevantLenses(["educator_social_reformer"]).map(lens => lens.id)).toEqual(["educational", "social", "cultural", "political", "institutional", "literary"]);
    expect(relevantLenses(["spiritual_teacher"]).map(lens => lens.id)).toEqual(["spiritual", "philosophical", "educational", "social", "cultural", "historical", "institutional"]);
    expect(relevantLenses(["rishi"]).map(lens => lens.id)).toEqual(["philosophical", "spiritual", "textual", "educational", "social", "historical"]);
    expect(relevantLenses(["social_entrepreneur"]).map(lens => lens.id)).toEqual(["economic", "social", "agricultural", "institutional", "technological", "leadership", "rural_development"]);
  });

  it("ranks evidence that speaks to the requested angle first", () => {
    const evidence = [
      claim(1, "Raman was born in Tiruchirappalli and studied at Presidency College."),
      claim(2, "Raman founded the Raman Research Institute in Bangalore and established the Indian Academy of Sciences."),
      claim(3, "Raman received the Nobel Prize in Physics."),
    ];
    expect(prioritizeEvidence("Explain C. V. Raman's institutional impact.", evidence, 3)[0].id).toBe("claim:2");
  });

  it("asks for live research only when local evidence says nothing about the angle", () => {
    const aliases = { personalityAliases: ["c v raman", "raman"] };
    const off = assessEvidenceSufficiency("Explain C. V. Raman's institutional impact.", [claim(1, "Raman received the Nobel Prize in Physics.")], aliases);
    expect(off.sufficient).toBe(false);
    expect(off.missingDimensions[0]).toMatch(/institutional perspective/);
    const on = assessEvidenceSufficiency("Explain C. V. Raman's institutional impact.", [claim(2, "Raman founded the Raman Research Institute in Bangalore.")], aliases);
    expect(on.sufficient).toBe(true);
  });

  it("does not treat general period context as the person's administrative record", () => {
    const aliases = { personalityAliases: ["Rani Lakshmibai of Jhansi", "Lakshmibai"] };
    const context = claim(1, "Company intervention weakened princely rulers through residents and reduced revenues. Lakshmibai's dispute arose within this erosion of royal power.");
    const decision = assessEvidenceSufficiency("What about the administrative angle? About Rani Lakshmibai of Jhansi.", [context], aliases);
    expect(decision.sufficient).toBe(false);
    expect(decision.missingDimensions[0]).toMatch(/administrative perspective/);
    const direct = claim(2, "Rani Lakshmibai of Jhansi governed her territory through named officials and supervised the collection of revenue during the crisis.");
    expect(assessEvidenceSufficiency("What about the administrative angle? About Rani Lakshmibai of Jhansi.", [direct], aliases).sufficient).toBe(true);
  });

  it("treats unusual-for-the-time wording as a request for context", () => {
    const result = assessEvidenceSufficiency("Why was her role unusual for her time?", [claim(1, "In 1858, women worked in the artillery batteries during the British siege.")]);
    expect(result.answerable).toBe(true);
    expect(result.sufficient).toBe(true);
  });

  it("puts the requested angle in the synthesis prompt and leaves it out otherwise", () => {
    const base = { personality: "C. V. Raman", question: "q", resolvedQuestion: "q", scope: "EXPLANATION" as const, evidenceContext: "[C1] x" };
    expect(buildSynthesisPrompt({ ...base, lens: { label: "Scientific", focus: "discoveries and methods" } })).toContain("asked for the scientific perspective");
    expect(buildSynthesisPrompt(base)).not.toContain("perspective. Build the answer");
  });
});

describe("historical context", () => {
  it("recognizes questions about period, novelty, and contemporaries", () => {
    expect(detectContextIntent("Why was his discovery important at the time?")).toBe("novelty");
    expect(detectContextIntent("Who else was working in related physics?")).toBe("contemporaries");
    expect(detectContextIntent("Who else was working on related problems then?")).toBe("contemporaries");
    expect(detectContextIntent("What was happening in India at that time?")).toBe("period");
    expect(detectContextIntent("What was innovative about his administration for the period?")).toBe("novelty");
    expect(detectContextIntent("Who was C. V. Raman?")).toBeNull();
  });

  it("recognizes a dated list of peers and keeps comparison requests distinct from relationship claims", () => {
    const peers = [claim(1, "Through the 1950s, Pattammal and Vasanthakumari were active alongside Subbulakshmi in Carnatic music."), claim(2, "The Music Academy listed Subbulakshmi and Pattammal among its awardees.")];
    expect(assessEvidenceSufficiency("Who were Subbulakshmi's contemporaries in Carnatic music?", peers, { personalityAliases: ["subbulakshmi"] }).answerable).toBe(true);
    expect(abstentionMessage("C. V. Raman", "Who else was working on related problems then?")).not.toMatch(/establish that connection/);
  });

  it("keeps follow-ups attached to the person without repeating the name", () => {
    const history = [{ question: "Who was C. V. Raman?", resolvedQuestion: "Who was C. V. Raman?", answer: "C. V. Raman discovered the Raman Effect in 1928." }];
    for (const question of ["How was that groundbreaking for the time?", "Who else was doing similar work?", "What about the political angle?", "What was the social impact?"])
      expect(resolveQuestionContext(question, ["C. V. Raman"], history).resolvedQuestion).toContain("C. V. Raman");
    expect(detectLens(resolveQuestionContext("What was the social impact?", ["C. V. Raman"], history).resolvedQuestion)?.id).toBe("social");
  });

  it("does not double a name when an alias is part of the full name", () => {
    const aliases = [{ alias: "Vivekananda", canonicalTerm: "Swami Vivekananda" }];
    expect(canonicalizeQuestion("Who was Swami Vivekananda?", aliases)).toBe("Who was Swami Vivekananda?");
    expect(canonicalizeQuestion("Who was Vivekananda?", aliases)).toBe("Who was Swami Vivekananda?");
  });

  it("needs evidence about the wider setting, not just a year, for a question about the period", () => {
    const aliases = { personalityAliases: ["swami vivekananda", "vivekananda"] };
    const question = "What was happening in India at that time? About Swami Vivekananda.";
    expect(assessEvidenceSufficiency(question, [claim(1, "He founded the Ramakrishna Mission in India on May 1, 1897.")], aliases).missingDimensions).toEqual(["historical period and setting"]);
    expect(assessEvidenceSufficiency(question, [claim(2, "In colonial India, reform movements were reshaping religious life.")], aliases).missingDimensions).not.toContain("historical period and setting");
  });

  it("searches when local evidence cannot place the work in its period", () => {
    const result = assessEvidenceSufficiency("How was C. V. Raman's discovery groundbreaking for the time?", [claim(1, "Raman made a discovery about scattered light.")], { personalityAliases: ["c v raman", "raman"] });
    expect(result.sufficient).toBe(false);
    expect(result.missingDimensions).toEqual(["state of the field before and after"]);
    expect(assessEvidenceSufficiency("How was C. V. Raman's discovery groundbreaking for the time?", [claim(2, "The discovery of 1928 gave earlier spectroscopy a new tool.")], { personalityAliases: ["c v raman", "raman"] }).sufficient).toBe(true);
  });

  it("does not invent dates for figures with uncertain chronology", () => {
    expect(chronologyGuidance(["rishi"])).toMatch(/Do not give exact years/);
    expect(chronologyGuidance(["scientist"])).toBe("");
    const prompt = buildSynthesisPrompt({ personality: "Vasistha", question: "q", resolvedQuestion: "q", scope: "BROAD_PROFILE", evidenceContext: "[C1] x", chronologyNote: chronologyGuidance(["rishi"]) });
    expect(prompt).toContain("Chronology for this figure is uncertain");
  });
});

describe("source authority", () => {
  it("labels publishers by standing", () => {
    expect(classifySourceAuthority({ url: "https://www.nobelprize.org/prizes/physics/1930/raman/", live: true }).level).toBe("authoritative");
    expect(classifySourceAuthority({ url: "https://vedicheritage.gov.in/samhitas/", live: true }).level).toBe("authoritative");
    expect(classifySourceAuthority({ url: "https://www.cambridge.org/core/books/x", live: true }).level).toBe("authoritative");
    expect(classifySourceAuthority({ url: "https://www.britannica.com/biography/Shivaji", live: true }).level).toBe("credible_secondary");
    expect(classifySourceAuthority({ url: "https://musicacademymadras.in/catalogue/files/souv/1968.pdf", sourceType: "primary_text" })).toMatchObject({ level: "credible_secondary", primary: true });
    expect(classifySourceAuthority({ url: "https://example-history.com/shivaji", sourceType: "institutional", live: true }).level).toBe("general_web");
  });

  it("treats primary source as a kind of material, not a level of trust", () => {
    const community = classifySourceAuthority({ url: "https://www.valmikiramayan.net/utf8/baala/sarga51/", sourceType: "primary_text", institution: "Valmiki Ramayana project" });
    expect(community).toMatchObject({ level: "general_web", primary: true });
    const institutional = classifySourceAuthority({ url: "https://vedicheritage.gov.in/samhitas/", sourceType: "primary_text" });
    expect(institutional).toMatchObject({ level: "authoritative", primary: true });
  });

  it("honors administrator rules", () => {
    const url = "https://example-history.com/shivaji";
    expect(classifySourceAuthority({ url, live: true }, [{ domain: "example-history.com", status: "allowed", category: "trusted" }]).level).toBe("authoritative");
    expect(classifySourceAuthority({ url, live: true }, [{ domain: "example-history.com", status: "allowed", category: "museum" }]).level).toBe("credible_secondary");
    expect(classifySourceAuthority({ url, live: true }, [{ domain: "example-history.com", status: "allowed", category: "university_press" }]).level).toBe("authoritative");
    expect(classifySourceAuthority({ url, live: true }, [{ domain: "example-history.com", status: "blocked", category: "trusted" }]).level).toBe("general_web");
  });

  it("carries authority on citations separately from claim certainty", () => {
    const item = claim(1, "A traditional account says the sage performed austerities.", { certainty: "low", epistemicType: "TRADITIONAL_NARRATIVE", sourceUrl: "https://vedicheritage.gov.in/x", sourceType: "primary_text" });
    const { citations, context } = buildBoundedContext([item]);
    expect(citations[0]).toMatchObject({ authority: "authoritative", primarySource: true, epistemicType: "TRADITIONAL_NARRATIVE" });
    expect(context).toContain("publisher standing: Authoritative source, primary source");
    expect(context).toContain("certainty: low");
  });

  it("distinguishes DCF Library from live research and classifies older saved citations", () => {
    const { citations } = buildBoundedContext([claim(1, "Raman founded an institute."), live(2, "https://www.britannica.com/biography/C-V-Raman")]);
    expect(citations.map((citation) => citation.kind)).toEqual(["approved_claim", "live_web_source"]);
    expect(citations[1].authority).toBe("credible_secondary");
    expect(citationAuthority({ id: "S1", kind: "live_web_source", title: "t", author: null, institution: null, url: "https://www.iisc.ac.in/x", sourceType: null, pageOrSection: null, textualLayer: null, excerpt: "" }).level).toBe("authoritative");
  });

  it("prefers the stronger publisher when relevance is equal", () => {
    const evidence = [live(1, "https://example-history.com/raman"), live(2, "https://www.nobelprize.org/raman")].map((item) => ({ ...item, authority: classifySourceAuthority({ url: item.sourceUrl, live: true }) }));
    expect(prioritizeEvidence("What did Raman study?", evidence, 2)[0].sourceUrl).toContain("nobelprize.org");
  });
});
