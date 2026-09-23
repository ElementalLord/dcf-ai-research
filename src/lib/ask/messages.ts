export const SYNTHESIS_FALLBACK_INTRO = "AI synthesis is temporarily unavailable. Here is the most relevant verified evidence";

export const SYNTHESIS_FALLBACK_NOTICE = "AI synthesis is temporarily unavailable, so the answer below presents the strongest retrieved evidence directly.";

export function abstentionMessage(personality: string): string {
  return `The approved sources currently available do not provide reliable evidence to answer this question about ${personality}.\n\nI can help explore documented aspects of ${personality}'s life, textual contributions, relationships, or traditions instead.`;
}
