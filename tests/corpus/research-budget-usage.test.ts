import { describe, expect, it } from "vitest";
import { authorizeResearchModelCall, finishResearchModelCall, recordAiCall,
  recordModelTokens, recordResearchBudgetReservation, recordResearchSearchCall, withRequestUsage } from "@/lib/corpus/usage";

describe("research budget accounting", () => {
  it("requires a conservative hold before each model call and reconciles reported tokens", async () => {
    await withRequestUsage(async usage => {
      recordResearchBudgetReservation("reservation", { reservedMicro: 20_000, searchEstimateMicro: 10_000,
        inputMicroPer1k: 1_000, outputMicroPer1k: 2_000, fallbackMicro: 8_000 });
      recordResearchSearchCall();
      const hold = authorizeResearchModelCall(300, 100);
      expect(hold).toBe(8_000);
      recordAiCall("generativeCalls", 7);
      recordModelTokens(100, 50);
      finishResearchModelCall(hold, 100, 50, true);
      expect(usage.researchActualModelMicro).toBe(200);
      expect(usage.researchPendingMicro).toBe(0);
      expect(usage.researchSearchCalls).toBe(1);
      const nextHold = authorizeResearchModelCall(300, 100);
      expect(nextHold).toBe(8_000);
      expect(() => authorizeResearchModelCall(300, 100)).toThrow("Research model budget exhausted");
      finishResearchModelCall(nextHold, null, null, false);
    });
  });
});
