/** Questions that ask how one person or thing bears on another. */
const CONNECTION = /\b(?:influenc\w+|inspir\w+|connect\w+|relationship|related to|relates to|link\w*|shap\w+|affect\w+|led to|lead to|caus\w+|respon\w+ to|react\w+ to)\b/i;

export function abstentionMessage(personality: string, question = ""): string {
  // A missing link is said plainly; nearby names and loosely related passages are never offered as if they answered it.
  if (CONNECTION.test(question)) return `I couldn't verify that connection for ${personality} from the evidence I found. The sources checked did not document how the two subjects were linked, so presenting a relationship would be speculation.\n\nThe links below are places to inspect for a source that establishes the connection.`;
  return `I couldn't verify a reliable answer to this question about ${personality}. The sources available to this request did not establish the specific fact well enough to present it as a supported answer.\n\nThe links below are places to inspect for further evidence on the question.`;
}
