import { describe, expect, it } from "vitest";
import { buildBoundedContext } from "@/lib/corpus/context";
import { classifySourceAuthority } from "@/lib/sources/authority";
import {
  assessPassageSupport, authenticateSource, entityMatch, evidenceTypeFor,
  independentWorkCount, planResearchQueries, sourceWorkKey,
} from "@/lib/live-research/research-quality";
import type { RetrievedPassage } from "@/lib/corpus/types";

describe("research query planning", () => {
  it("plans the missing comparison and priority dimensions instead of a generic name query", () => {
    const plan = planResearchQueries("Jagadish Chandra Bose", "How did Bose's microwave work compare with Marconi's early wireless work and priority claims?", ["apparatus and wavelength", "chronology"]);
    expect(plan.length).toBeLessThanOrEqual(2);
    expect(plan.map((item) => item.intent)).toContain("controversy");
    expect(plan.some((item) => /apparatus|wavelength|chronology/.test(item.query))).toBe(true);
    expect(plan.every((item) => item.query !== "Jagadish Chandra Bose")).toBe(true);
  });

  it("chooses primary-text and exact-work strategies only when the question calls for them", () => {
    expect(planResearchQueries("Ashoka", "What do Ashoka's own edicts say about dhamma?", [])[0].intent).toBe("primary");
    expect(planResearchQueries("Verghese Kurien", "When was Operation Flood launched?", [])[0].intent).toBe("institutional");
  });

  it("searches documented visions for a broad ideas question", () => {
    const plan = planResearchQueries("A. P. J. Abdul Kalam", "What ideas are associated with A. P. J. Abdul Kalam?");
    expect(plan[0].query).toMatch(/vision/);
    expect(plan[0].query).toMatch(/philosophy/);
  });

  it("searches a person's contributions for a known-for question", () => {
    const plan = planResearchQueries("Jamsetji Tata", "What is Jamsetji Tata known for?");
    expect(plan[0].query).toMatch(/contributions achievements biography/);
    expect(plan[0].query).not.toMatch(/documented work/);
  });

  it("searches broad contributions for an ordinary custom importance question", () => {
    const [plan] = planResearchQueries("Adi Shankaracharya", "what did Adi Shankaracharya do that is important");
    expect(plan.query).toContain("contributions achievements biography");
    expect(plan.query).not.toMatch(/find me it/i);
  });
  it("searches the impact of a free-form change question without its filler words", () => {
    const [plan] = planResearchQueries("Savitribai Phule", "what did Savitribai Phule actually change?");
    expect(plan.query).toContain("contributions achievements biography");
    expect(plan.query).not.toMatch(/actually|change/);
    const [film] = planResearchQueries("Satyajit Ray", "What did Satyajit Ray change about Indian movies?");
    expect(film.query).toMatch(/impact contributions/);
  });

  it("uses a concise administration query for a paraphrased governance question", () => {
    const [plan] = planResearchQueries("Chhatrapati Shivaji Maharaj", "How did Chhatrapati Shivaji Maharaj govern his kingdom?");
    expect(plan.query).toMatch(/administration governance/);
    expect(plan.query).not.toMatch(/archive museum university/);
  });

  it("rejects a governance label without any governing practice", () => {
    const q = "How did Chhatrapati Shivaji Maharaj govern his kingdom?";
    expect(assessPassageSupport("Maratha administration is a term used to describe the administration of a Kingdom under Chhatrapati Shivaji Maharaj and his successors.",
      q, "Chhatrapati Shivaji Maharaj").level).toBe("RELATED");
    expect(assessPassageSupport("Chhatrapati Shivaji Maharaj appointed a council of ministers to oversee the kingdom's administration and revenue collection.",
      q, "Chhatrapati Shivaji Maharaj").level).toBe("STRONG");
  });

  it("searches the topic of a contemporaries follow-up without treating chat framing as source terms", () => {
    const question = "Who else was doing similar work at the time? Follow-up to: What did A. P. J. Abdul Kalam do for India's space programme? About A. P. J. Abdul Kalam.";
    const plan = planResearchQueries("A. P. J. Abdul Kalam", question);
    expect(plan[0].query).toContain("space programme");
    expect(plan[0].query).toContain("contemporaries");
    expect(plan[0].query).not.toMatch(/doing|follow up|topic|question/);
  });

  it.each([
    ["Vishvamitra", "What is securely supported by the Rigveda versus later Ramayana tradition?"],
    ["Adi Shankaracharya", "Which works are securely attributed to Shankara and which are disputed?"],
    ["Guru Nanak", "What do primary Sikh sources support about his teachings versus later biography?"],
    ["Jagadish Chandra Bose", "What exactly did Bose contribute to early radio and microwave research, and how should priority claims be framed?"],
    ["C. V. Raman", "Why was the Raman effect scientifically important at the time?"],
    ["Ashoka", "What do Ashoka's own edicts tell us about dhamma?"],
    ["Rani Lakshmibai", "What is securely known about her role in 1857 and what remains contested?"],
    ["Verghese Kurien", "How much of India's milk-production growth can reasonably be attributed to Operation Flood?"],
    ["Jamsetji Tata", "What role did Jamsetji personally play in projects completed after his death?"],
    ["Satyajit Ray", "What evidence supports claims about the international influence of his filmmaking?"],
    ["Rabindranath Tagore", "How did Tagore's educational philosophy relate to Santiniketan?"],
  ])("keeps representative research for %s focused and bounded", (personality, question) => {
    const plan = planResearchQueries(personality, question, ["direct passage support"]);
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.length).toBeLessThanOrEqual(2);
    expect(plan.every((item) => item.query.includes(personality))).toBe(true);
    expect(plan.every((item) => item.query.length < 600)).toBe(true);
  });
});

describe("source identity and independence", () => {
  it("groups HTML, PDF, and mirror copies of the same named work", () => {
    const title = "The Diffusion of Wireless Communication in the Nineteenth Century";
    const keys = [
      sourceWorkKey({ url: "https://journal.example/paper", title, author: "A. Historian" }),
      sourceWorkKey({ url: "https://repository.edu/paper.pdf", title: `${title} - PDF`, author: "A. Historian" }),
      sourceWorkKey({ url: "https://archive.org/details/paper", title, author: "A. Historian" }),
    ];
    expect(new Set(keys).size).toBe(1);
    expect(independentWorkCount(keys.map((workKey) => ({ workKey })))).toBe(1);
  });

  it("uses stable identifiers ahead of host or title", () => {
    expect(sourceWorkKey({ url: "https://publisher.test/a", title: "One title", doi: "10.1234/ABC.1" }))
      .toBe(sourceWorkKey({ url: "https://repository.test/b", title: "Repository copy", doi: "https://doi.org/10.1234/abc.1" }));
  });

  it("keeps host authority separate from primary/traditional evidence type", () => {
    const identity = authenticateSource({ url: "https://ordinary.example/rigveda", title: "Rigveda 3.33", author: "Translator", sourceType: "traditional narrative" });
    const authority = classifySourceAuthority({ url: "https://ordinary.example/rigveda", sourceType: "traditional narrative", live: true });
    expect(identity.evidenceType).toBe("traditional_text");
    expect(authority.level).toBe("general_web");
    expect(evidenceTypeFor({ sourceType: "peer-reviewed journal article" })).toBe("scholarly_interpretation");
  });
});

describe("entity and passage admission", () => {
  it("rejects the wrong Bose while accepting the configured person", () => {
    expect(entityMatch("Subhas Chandra Bose led the Indian National Army.", "Jagadish Chandra Bose", ["J. C. Bose", "Bose"]).matched).toBe(false);
    expect(entityMatch("Jagadish Chandra Bose demonstrated millimetre-wave apparatus.", "Jagadish Chandra Bose", ["J. C. Bose", "Bose"]).matched).toBe(true);
  });

  it("does not promote a title-only mention or a merely related passage", () => {
    expect(assessPassageSupport("Jagadish Chandra Bose appears in the conference index.", "What apparatus and wavelength did Bose use?", "Jagadish Chandra Bose", ["Bose"]).level).toBe("RELATED");
    expect(assessPassageSupport("Jagadish Chandra Bose used millimetre-wave apparatus at short wavelengths in his experiments.", "What apparatus and wavelength did Bose use?", "Jagadish Chandra Bose", ["Bose"]).level).toMatch(/EXACT|STRONG/);
  });

  it("accepts a substantive vision passage for an ideas question while rejecting a name-only mention", () => {
    const question = "What ideas are associated with A. P. J. Abdul Kalam?";
    expect(assessPassageSupport("A. P. J. Abdul Kalam is listed in the presidential archive index.", question,
      "A. P. J. Abdul Kalam").level).toBe("RELATED");
    expect(assessPassageSupport("A. P. J. Abdul Kalam described a vision of a developed India built through education, scientific work, and opportunities for young people.",
      question, "A. P. J. Abdul Kalam").level).toBe("STRONG");
  });

  it("accepts a named contribution for a known-for question without accepting an index entry or another person's work", () => {
    const question = "What is Jamsetji Tata known for?";
    expect(assessPassageSupport("Jamsetji Tata appears in the index of this historical collection.", question, "Jamsetji Tata").level).toBe("RELATED");
    expect(assessPassageSupport("Jamsetji Tata founded major industrial enterprises and laid the groundwork for the Indian Institute of Science in Bengaluru.", question, "Jamsetji Tata").level).toBe("STRONG");
    expect(assessPassageSupport("Jamsetji Tata appears in the index. Dorabji Tata established an industrial enterprise that transformed the city.", question, "Jamsetji Tata").level).toBe("RELATED");
  });

  it("requires a named person and the requested angle in the same source statement", () => {
    const question = "What about the administrative angle? About Rani Lakshmibai of Jhansi.";
    const general = "British residents reduced the revenues and military forces of several princely rulers. Rani Lakshmibai of Jhansi disputed the loss of royal power.";
    const direct = "Rani Lakshmibai of Jhansi governed the territory through appointed officials and supervised revenue collection during the crisis.";
    expect(assessPassageSupport(general, question, "Rani Lakshmibai of Jhansi", ["Lakshmibai"]).level).toMatch(/PARTIAL|RELATED/);
    expect(assessPassageSupport(direct, question, "Rani Lakshmibai of Jhansi", ["Lakshmibai"]).level).toBe("STRONG");
  });

  it("searches a requested angle with a concise person and topic query", () => {
    const [plan] = planResearchQueries("Rani Lakshmibai of Jhansi", "What about the administrative angle? About Rani Lakshmibai of Jhansi.",
      ["administrative perspective: how government was organized through councils, revenue, law, and officials"]);
    expect(plan.query).toContain("Rani Lakshmibai of Jhansi");
    expect(plan.query).toContain("administration governance");
    expect(plan.query).not.toContain("perspective");
    expect(plan.query.split(" ").length).toBeLessThan(11);
  });

  it("carries passage-level provenance into the rendered citation", () => {
    const passage: RetrievedPassage = { kind: "passage", id: "p", chunkId: "p", sourceId: "s", text: "Ashoka's edict describes dhamma as restraint and proper conduct.",
      sectionTitle: "Edict", pageOrSection: "Rock Edict XII", textualLayer: "Inscription", sourceTitle: "Corpus Inscriptionum Indicarum", sourceAuthor: "Editor",
      sourceInstitution: "Archive", sourceUrl: "https://archive.example/ashoka", sourceType: "primary", sourceStatus: "discovered", origin: "google_grounding", lexicalScore: 1,
      evidenceType: "primary_document", supportLevel: "STRONG", supportReason: "Direct passage support", workKey: "work:ashoka-edicts", accessibility: "READABLE",
      provenance: { title: "Corpus Inscriptionum Indicarum", author: "Editor", publisher: "Archive", complete: true } };
    const citation = buildBoundedContext([passage]).citations[0];
    expect(citation).toMatchObject({ url: passage.sourceUrl, excerpt: passage.text, pageOrSection: "Rock Edict XII", supportLevel: "STRONG", workKey: "work:ashoka-edicts", accessibility: "READABLE" });
  });
});
