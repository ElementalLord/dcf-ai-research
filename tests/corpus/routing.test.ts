import { describe, expect, it } from "vitest";
import { routeParameterCodes } from "@/lib/corpus/routing";

const parameters = [
  { code: "role", routingHints: ["role", "sage", "king", "portrayal"] },
  { code: "textual_contribution", routingHints: ["rigveda", "rigvedic", "hymn", "text", "verse"] },
  { code: "tapas_sadhana", routingHints: ["tapas", "austerity"] },
  { code: "philosophy", routingHints: ["river", "rivers", "philosophy"] },
  { code: "parampara", routingHints: ["lineage", "disciple"] },
  { code: "social_role", routingHints: ["relationship", "teacher"] },
  { code: "historical_context", routingHints: ["rigvedic", "ramayana", "differ"] },
  { code: "contested", routingHints: ["contested", "uncertain"] },
];

describe("parameter routing", () => {
  it("routes textual, tapas, and relationship questions", () => {
    expect(routeParameterCodes("Which Rigveda hymns are associated with the selected person?", parameters)).toContain("textual_contribution");
    expect(routeParameterCodes("How did his tapas and austerities change him?", parameters)).toContain("tapas_sadhana");
    expect(routeParameterCodes("What was the sage's relationship with his teacher?", parameters)).toContain("social_role");
    expect(routeParameterCodes("How does the Rigvedic figure differ from the Ramayana portrayal?", parameters)).toEqual(
      expect.arrayContaining(["textual_contribution", "role", "historical_context"]),
    );
    expect(routeParameterCodes("What evidence exists for the rivers in Rigveda 3.33?", parameters)).toContain("philosophy");
  });
});
