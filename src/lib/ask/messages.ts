export function abstentionMessage(personality: string): string {
  return `The approved sources currently available do not provide reliable evidence to answer this question about ${personality}.\n\nI can help explore documented aspects of ${personality}'s life, textual contributions, relationships, or traditions instead.`;
}
