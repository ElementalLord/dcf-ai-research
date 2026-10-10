/** Search terms describe the uncovered topic, never a generic personality query. */
export function gapSearchQueries(personality: string, question: string, missing: string[]): string[] {
  const clean = (value: string) => value.replace(/[^\p{L}\p{N} .-]/gu, " ").replace(/\s+/g, " ").trim();
  const target = [...new Set(missing.map(clean).filter((value) => value && !/^(?:direct evidence|general evidence|evidence)$/i.test(value)))].slice(0, 2);
  if (/relationship|between|conflict|clash|enem|rival/i.test(question) && !target.some((value) => /relationship|conflict|rival/i.test(value))) target.unshift("relationship conflict cause");
  target.splice(2);
  if (!target.length) {
    const value = question.toLowerCase();
    if (/relationship|between|conflict|clash|enem|rival/.test(value)) target.push("relationship conflict cause", "original account rivalry");
    else if (/why|important|accomplish|contribut/.test(value)) target.push("major roles works contributions", "primary source role");
    else target.push(/teach|taught|instruct/.test(value) ? "teaching and mentorship" : /^who\b/.test(value.trim()) ? "identity field major work" : "documented source account");
  }
  const ignored = new Set(["what", "who", "why", "when", "where", "which", "does", "did", "was", "were", "are", "is", "say", "about", "the", "and", "his", "her", "for", "with", "significance", "important"]);
  for (const word of clean(personality).toLowerCase().split(" ")) ignored.add(word);
  const focus = clean(question).split(" ").filter((word) => !ignored.has(word.toLowerCase()) && word.length > 1).slice(0, 4);
  const citedTopic = question.match(/Earlier cited topic:\s*([^.]+)/i)?.[1] || "";
  return target.map((dimension) => clean(`${personality} ${[...new Set([...dimension.split(" "), ...focus])].join(" ")} ${citedTopic.slice(0, 100)}`));
}
