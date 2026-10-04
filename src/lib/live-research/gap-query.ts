/** Search terms describe the uncovered topic, never a generic personality query. */
export function gapSearchQueries(personality: string, question: string, missing: string[]): string[] {
  const clean = (value: string) => value.replace(/[^\p{L}\p{N} .-]/gu, " ").replace(/\s+/g, " ").trim();
  const target = [...new Set(missing.map(clean).filter(Boolean))].slice(0, 2);
  const ignored = new Set(["what", "who", "when", "where", "which", "does", "did", "was", "were", "are", "is", "say", "about", "the", "and", "his", "her", "for", "with", "significance", "important"]);
  for (const word of clean(personality).toLowerCase().split(" ")) ignored.add(word);
  const focus = clean(question).split(" ").filter((word) => !ignored.has(word.toLowerCase()) && word.length > 1).slice(0, 4);
  return target.map((dimension) => clean(`${personality} ${[...new Set([...dimension.split(" "), ...focus])].join(" ")}`));
}
