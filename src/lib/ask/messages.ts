/** Questions that ask how one person or thing bears on another. */
const CONNECTION = /\b(?:influenc\w+|inspir\w+|connect\w+|relationship|related to|relates to|link\w*|shap\w+|affect\w+|led to|lead to|caus\w+|respon\w+ to|react\w+ to)\b/i;

export function abstentionMessage(personality: string, question = ""): string {
  // A missing link is said plainly; nearby names and loosely related passages are never offered as if they answered it.
  if (CONNECTION.test(question)) return `I couldn't verify that connection for ${personality} from the evidence I found.\n\nUse the links below to look for a source that documents the link.`;
  return `I couldn't verify a reliable answer to this question about ${personality}.\n\nUse the links below to continue researching this topic.`;
}
