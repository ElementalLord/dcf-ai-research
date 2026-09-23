import { describe, expect, it } from "vitest";
import { routeParameterCodes } from "@/lib/corpus/routing";

const codes = ["role", "textual_contribution", "tapas_sadhana", "philosophy", "parampara", "social_role", "historical_context", "contested"];

describe("parameter routing", () => {
  it("routes textual, tapas, and relationship questions", () => {
    expect(routeParameterCodes("Which Rigveda hymns are associated with Vishvamitra?", codes)).toContain("textual_contribution");
    expect(routeParameterCodes("How did his tapas and austerities change him?", codes)).toContain("tapas_sadhana");
    expect(routeParameterCodes("What was Vishvamitra's relationship with Vasistha?", codes)).toContain("social_role");
    expect(routeParameterCodes("How does the Rigvedic Vishvamitra differ from the Ramayana portrayal?", codes)).toEqual(
      expect.arrayContaining(["textual_contribution", "role", "historical_context"]),
    );
    expect(routeParameterCodes("What evidence exists for the rivers in Rigveda 3.33?", codes)).toContain("philosophy");
  });
});
