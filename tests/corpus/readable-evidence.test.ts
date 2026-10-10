import { describe, expect, it } from "vitest";
import { readableEvidence } from "@/lib/corpus/readable-evidence";
import { sectionsFromHtml } from "@/lib/corpus/source-extract";

describe("readable research evidence", () => {
  it("keeps prose while excluding code and page markup", () => {
    expect(readableEvidence("The text describes a sustained practice of attention.")).toBe("The text describes a sustained practice of attention.");
    expect(readableEvidence("const source = document.querySelector('article');")).toBeNull();
    expect(readableEvidence("<div class='entry'>A historical account</div>")).toBeNull();
    expect(readableEvidence('Raman received the prize. <img src="portrait.jpg" alt="portrait" />')).toBe("Raman received the prize.");
  });

  it("does not extract code blocks as source passages", () => {
    const sections = sectionsFromHtml("<main><h1>History</h1><p>A readable account of the person's work and its reception.</p><pre>const answer = 42;</pre><code>function example() {}</code></main>");
    expect(sections[0]?.text).toContain("readable account");
    expect(sections[0]?.text).not.toContain("const answer");
    expect(sections[0]?.text).not.toContain("function example");
  });
});
