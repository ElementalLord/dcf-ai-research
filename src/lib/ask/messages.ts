/** Questions that ask how one person or thing bears on another. */
const CONNECTION = /\b(?:influenc\w+|inspir\w+|connect\w+|relationship|related to|relates to|link\w*|shap\w+|affect\w+|led to|lead to|caus\w+|respon\w+ to|react\w+ to)\b/i;

export function abstentionMessage(personality: string, question = ""): string {
  // A missing link is said plainly; nearby names and loosely related passages are never offered as if they answered it.
  if (CONNECTION.test(question)) return `I don't have enough evidence to establish that connection for ${personality}.\n\nThe sources I have describe ${personality}'s own life and work, but they do not document this link. Try asking what the sources do say about either side of it.`;
  return `The approved sources currently available do not provide reliable evidence to answer this question about ${personality}.\n\nTry asking about a documented part of ${personality}'s life or work.`;
}
