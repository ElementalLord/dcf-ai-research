export type QuestionScope =
  | "NARROW_FACT"
  | "EXPLANATION"
  | "BROAD_PROFILE"
  | "BROAD_SIGNIFICANCE"
  | "TEXT_SPECIFIC"
  | "RELATIONSHIP"
  | "COMPARISON"
  | "CONTESTED_OR_HISTORICAL";

/** Informal questions about why a person's work remains relevant. */
export function isEnduringRelevanceQuestion(text: string): boolean {
  return /\bwhy\b.{0,80}\b(?:still|today|nowadays)\b.{0,100}\b(?:read|study|teach|remember|discuss|perform|use|matter|care|influenc\w*|relevant)\b|\bwhy\b.{0,80}\b(?:read|study|teach|remember|discuss|perform|use|care)\b.{0,80}\b(?:still|today|nowadays)\b/i.test(text);
}

export function isChangeImpactQuestion(text: string): boolean {
  return /\bwhat (?:did|does|has) .{0,80} (?:change|transform|reshape|alter|improve)\b/i.test(text);
}

/** Ordinary ways people ask why someone's work mattered, including free-form follow-ups. */
export function isBroadImportanceQuestion(text: string): boolean {
  return isEnduringRelevanceQuestion(text) || isChangeImpactQuestion(text)
    || /\b(?:known for|why (?:is|was|are|were) .{0,80} important|why (?:does|did) .{0,80} matter|what (?:made|makes) .{0,80} important|what (?:did|does|has) .{0,80} do (?:that|which) (?:mattered|matters|made a difference|(?:is|was|became) (?:important|significant))|what .{0,80} did (?:that|which) (?:mattered|matters|was (?:important|significant))|biggest|greatest|major contributions?|main contributions?|most significant|most important .{0,100}(?:works?|teachings?|actions?|institutions?|contributions?|discoveries?|experiments?|traditions?)|what (?:did|does|has) .{0,80} (?:accomplish|contribute))\b/i.test(text);
}

/** Routing is deterministic and independent of model availability. */
export function classifyQuestionScope(question: string): QuestionScope {
  const text = question.trim();
  if (/\b(?:compare|comparison|differ|difference|contrast|similar|comparable|contemporaries|anyone else|someone else)\b/i.test(text)) return "COMPARISON";
  if (/\b(?:what happened between|relationship between|relationship with|relation to|rivalry with|disagreement with)\b/i.test(text)) return "RELATIONSHIP";
  if (/\b(?:who is|who was|tell me about|overview of|biograph\w*|profile of|introduce)\b/i.test(text)) return "BROAD_PROFILE";
  if (/^what (?:did|does) .{2,100} do\??$/i.test(text)) return "BROAD_PROFILE";
  if (/\b(?:what|which) (?:ideas|beliefs|principles|values|visions?)\b.{0,100}\b(?:associated with|known for|did|does|hold|have|advocate|promote)\b/i.test(text)) return "BROAD_SIGNIFICANCE";
  if (isBroadImportanceQuestion(text)) return "BROAD_SIGNIFICANCE";
  if (/\b(?:historical|historicity|contested|uncertain|conflicting accounts|date of|when did .* live)\b/i.test(text)) return "CONTESTED_OR_HISTORICAL";
  if (/\b\d+(?:\.\d+)+\b|\b(?:which|what) texts?\b|\b(?:hymn|sukta|mandala|chapter|verse|sarga)\b/i.test(text)) return "TEXT_SPECIFIC";
  if (/\b(?:why|how|explain|significance|meaning|become|became|role in)\b/i.test(text)) return "EXPLANATION";
  return "NARROW_FACT";
}

export function isBroadScope(scope: QuestionScope): boolean {
  return scope === "BROAD_PROFILE" || scope === "BROAD_SIGNIFICANCE";
}
