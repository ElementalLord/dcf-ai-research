export type AskCitation = {
  id: string;
  kind: "approved_claim" | "approved_source_passage";
  title: string;
  author: string | null;
  institution: string | null;
  url: string | null;
  sourceType: string | null;
  pageOrSection: string | null;
  textualLayer: string | null;
  excerpt: string;
  claimId?: string;
  chunkId?: string;
  personalityName?: string;
  approvalOrigin?: string;
  evidenceType?: string;
};

export type InlineAnswerPart =
  | { type: "text"; value: string }
  | { type: "citation"; value: string; citationId: string };

export type AnswerBlock =
  | { type: "heading"; parts: InlineAnswerPart[] }
  | { type: "paragraph"; parts: InlineAnswerPart[] }
  | { type: "list"; items: InlineAnswerPart[][] };

export type CitationGroup = {
  key: string;
  citations: AskCitation[];
  title: string;
  author: string | null;
  institution: string | null;
  url: string | null;
  sourceType: string | null;
  textualLayer: string | null;
};

export function inlineAnswerParts(value: string): InlineAnswerPart[] {
  const parts: InlineAnswerPart[] = [];
  let offset = 0;
  for (const match of value.matchAll(/\[([CS]\d+)\]/g)) {
    const index = match.index ?? 0;
    if (index > offset) parts.push({ type: "text", value: value.slice(offset, index) });
    parts.push({ type: "citation", value: match[0], citationId: match[1] });
    offset = index + match[0].length;
  }
  if (offset < value.length) parts.push({ type: "text", value: value.slice(offset) });
  return parts.length > 0 ? parts : [{ type: "text", value }];
}

export function answerBlocks(answer: string): AnswerBlock[] {
  const lines = answer.replace(/\r\n/g, "\n").split("\n");
  const blocks: AnswerBlock[] = [];
  let paragraph: string[] = [];
  let list: InlineAnswerPart[][] = [];
  const flushParagraph = () => {
    if (paragraph.length > 0) blocks.push({ type: "paragraph", parts: inlineAnswerParts(paragraph.join(" ")) });
    paragraph = [];
  };
  const flushList = () => {
    if (list.length > 0) blocks.push({ type: "list", items: list });
    list = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = line.match(/^#{1,3}\s+(.+)$/) || line.match(/^\*\*(.+)\*\*$/);
    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", parts: inlineAnswerParts(heading[1]) });
    } else if (bullet) {
      flushParagraph();
      list.push(inlineAnswerParts(bullet[1]));
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}

export function groupCitations(citations: AskCitation[]): CitationGroup[] {
  const groups = new Map<string, CitationGroup>();
  for (const citation of citations) {
    const key = citation.url || `${citation.title}|${citation.author || ""}|${citation.institution || ""}`;
    const existing = groups.get(key);
    if (existing) {
      existing.citations.push(citation);
      continue;
    }
    groups.set(key, {
      key,
      citations: [citation],
      title: citation.title,
      author: citation.author,
      institution: citation.institution,
      url: citation.url,
      sourceType: citation.sourceType,
      textualLayer: citation.textualLayer,
    });
  }
  return [...groups.values()];
}

export function sourceTypeLabel(citation: AskCitation): string {
  const explicitType = (citation.sourceType || "").toLocaleLowerCase();
  const metadata = `${citation.evidenceType || ""} ${citation.textualLayer || ""}`.toLocaleLowerCase();
  if (/institution|archive|museum|university|government/.test(explicitType)) return "Institutional Source";
  if (/scholar|academic|journal|monograph|critical/.test(explicitType)) return "Scholarly Source";
  if (/primary/.test(explicitType)) return "Primary Text";
  if (/modern|contemporary|spiritual interpretation/.test(explicitType)) return "Modern Interpretation";
  if (/tradition|traditional|epic|narrative/.test(explicitType)) return "Traditional Narrative";
  if (/primary|veda|rigveda|ramayana|mahabharata|purana/.test(metadata)) return "Primary Text";
  if (/modern|contemporary|spiritual interpretation/.test(metadata)) return "Modern Interpretation";
  if (/tradition|traditional|epic|narrative/.test(metadata)) return "Traditional Narrative";
  return citation.kind === "approved_claim" ? "Approved Claim" : "Approved Source";
}

export function suggestedQuestions(personality: string): string[] {
  return [
    `Who is ${personality}?`,
    `What are ${personality}'s major textual contributions?`,
    `How do different textual traditions portray ${personality}?`,
    `Which relationships are important in accounts of ${personality}?`,
  ];
}

export function followUpQuestions(personality: string): string[] {
  return [
    `Which texts are most closely associated with ${personality} in the available evidence?`,
    `How do the sources describe ${personality}'s role?`,
    `Where do textual traditions differ about ${personality}?`,
  ];
}
