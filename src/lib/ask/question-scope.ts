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
  if (/\b(?:compare|comparison|differ|difference|contrast|similar|comparable|contemporaries|anyone else|someone else)\b/i.test(text)) return "COMPARISON";
  if (/\b(?:what happened between|relationship between|relationship with|relation to|rivalry with|disagreement with)\b/i.test(text)) return "RELATIONSHIP";
  if (/\b(?:who is|who was|tell me about|overview of|biograph\w*|profile of|introduce)\b/i.test(text)) return "BROAD_PROFILE";
  if (/^what (?:did|does) .{2,100} do\??$/i.test(text)) return "BROAD_PROFILE";
  if (/\b(?:known for|why (?:is|was|are|were) .{0,80} important|why (?:does|did) .{0,80} matter|what (?:made|makes) .{0,80} important|what (?:did|does|has) .{0,80} do (?:that|which) (?:mattered|matters|made a difference)|biggest|greatest|major contributions?|main contributions?|most significant|most important .{0,100}(?:works?|teachings?|actions?|institutions?|contributions?|discoveries?|experiments?|traditions?)|what (?:did|does|has) .{0,80} (?:accomplish|contribute))\b/i.test(text)) return "BROAD_SIGNIFICANCE";
  if (/\b(?:historical|historicity|contested|uncertain|conflicting accounts|date of|when did .* live)\b/i.test(text)) return "CONTESTED_OR_HISTORICAL";
  if (/\b\d+(?:\.\d+)+\b|\b(?:which|what) texts?\b|\b(?:hymn|sukta|mandala|chapter|verse|sarga)\b/i.test(text)) return "TEXT_SPECIFIC";
  if (/\b(?:why|how|explain|significance|meaning|become|became|role in)\b/i.test(text)) return "EXPLANATION";
  return "NARROW_FACT";
}

export function isBroadScope(scope: QuestionScope): boolean {
  return scope === "BROAD_PROFILE" || scope === "BROAD_SIGNIFICANCE";
}
