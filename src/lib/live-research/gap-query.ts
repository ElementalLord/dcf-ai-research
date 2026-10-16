import { planResearchQueries } from "./research-quality";

/** Search terms describe the uncovered topic, never a generic personality query. */
export function gapSearchQueries(personality: string, question: string, missing: string[]): string[] {
  const citedTopic = question.match(/Earlier cited topic:\s*([^.]+)/i)?.[1]?.trim();
  return planResearchQueries(personality, question, missing, 2).map((item) => citedTopic && !item.query.toLowerCase().includes(citedTopic.toLowerCase())
    ? `${item.query} ${citedTopic}`.slice(0, 600) : item.query);
}
