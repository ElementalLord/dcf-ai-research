export function abstentionMessage(personality: string): string {
  return `The approved sources currently available do not provide reliable evidence to answer this question about ${personality}.\n\nTry asking about a documented part of ${personality}'s life or work.`;
}
