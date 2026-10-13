import { framedStatement } from "@/lib/claim-epistemics/language";
import { normalizeForMatch } from "@/lib/corpus/text";
import type { Citation, RetrievedEvidence } from "@/lib/corpus/types";

const ROLE = /\b(?:sage|seer|rishi|scientist|physicist|chemist|historian|researcher|king|queen|ruler|teacher|poet|author|philosopher|leader|mathematician|scholar|monk|ascetic|musician|performer|singer|vocalist|artist)\b/i;

/** Add a brief, cited introduction when an opening answer jumps straight into a detail. */
export function ensureOpeningIntro(answer: string, personality: string, evidence: RetrievedEvidence[], citations: Citation[], openingTurn: boolean): string {
  if (!openingTurn || !answer.trim()) return answer;
  const name = normalizeForMatch(personality);
  const opening = normalizeForMatch(answer.split(/\n\s*\n/)[0].slice(0, 320));
  if (opening.includes(name) && ROLE.test(opening)) return answer;

  const candidates = evidence.map((item, index) => ({ item, citation: citations[index] }))
    .filter((entry) => entry.citation && entry.item.kind === "claim" && entry.item.epistemicType !== "METHODOLOGICAL"
      && normalizeForMatch(entry.item.text).includes(name) && ROLE.test(entry.item.text))
    .sort((left, right) => Number(/role|identity|profile|vocation/i.test(`${right.item.kind === "claim" ? right.item.parameterCode : ""} ${right.item.kind === "claim" ? right.item.fieldLabel : ""}`))
      - Number(/role|identity|profile|vocation/i.test(`${left.item.kind === "claim" ? left.item.parameterCode : ""} ${left.item.kind === "claim" ? left.item.fieldLabel : ""}`)));
  const selected = candidates.find(({ item }) => item.text.length <= 220);
  if (!selected || selected.item.kind !== "claim") return answer;
  const statement = framedStatement(selected.item).trim().replace(/[.!?]+$/, "");
  if (normalizeForMatch(answer).includes(normalizeForMatch(statement))) return answer;
  return `${statement}. [${selected.citation.id}]\n\n${answer}`;
}
