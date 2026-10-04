export type QuestionScope =
  | "NARROW_FACT"
  | "EXPLANATION"
  | "BROAD_PROFILE"
  | "BROAD_SIGNIFICANCE"
  | "TEXT_SPECIFIC"
  | "RELATIONSHIP"
  | "COMPARISON"
  | "CONTESTED_OR_HISTORICAL";

/** Routing is deterministic and independent of model availability. */
export function classifyQuestionScope(question: string): QuestionScope {
  const text = question.trim();
  if (/\b(?:compare|comparison|differ|difference|contrast)\b/i.test(text)) return "COMPARISON";
  if (/\b(?:historical|historicity|contested|uncertain|conflicting accounts|date of|when did .* live)\b/i.test(text)) return "CONTESTED_OR_HISTORICAL";
  if (/\b(?:what happened between|relationship between|relationship with|relation to|rivalry with|disagreement with)\b/i.test(text)) return "RELATIONSHIP";
  if (/\b(?:who is|who was|tell me about|overview of|biograph\w*|profile of|introduce)\b/i.test(text)) return "BROAD_PROFILE";
  if (/\b(?:known for|why (?:is|was|are|were) .{0,80} important|biggest|greatest|major contributions?|main contributions?|most significant|what (?:did|does|has) .{0,80} (?:accomplish|contribute))\b/i.test(text)) return "BROAD_SIGNIFICANCE";
  if (/\b\d+(?:\.\d+)+\b|\b(?:which|what) texts?\b|\b(?:hymn|sukta|mandala|chapter|verse|sarga)\b/i.test(text)) return "TEXT_SPECIFIC";
  if (/\b(?:why|how|explain|significance|meaning|become|became|role in)\b/i.test(text)) return "EXPLANATION";
  return "NARROW_FACT";
}

export function isBroadScope(scope: QuestionScope): boolean {
  return scope === "BROAD_PROFILE" || scope === "BROAD_SIGNIFICANCE";
}
