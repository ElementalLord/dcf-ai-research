import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ result: { data: { auto_admission_paused: true } as unknown, error: null as unknown }, throws: false, reads: 0 }));
vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => {
      state.reads++;
      if (state.throws) throw new Error("offline");
      return state.result;
    } }) }) }),
  },
}));

describe("AI can add sources and facts (website setting)", () => {
  beforeEach(async () => {
    const { clearAiKnowledgePermissionCache } = await import("@/lib/ai-knowledge-permission");
    clearAiKnowledgePermissionCache();
    state.throws = false; state.reads = 0;
  });

  it("is on only when the stored setting says additions are not paused", async () => {
    const { aiMayAddKnowledge } = await import("@/lib/ai-knowledge-permission");
    state.result = { data: { auto_admission_paused: false }, error: null };
    expect(await aiMayAddKnowledge()).toBe(true);
  });

  it("is off when the setting is paused", async () => {
    const { aiMayAddKnowledge } = await import("@/lib/ai-knowledge-permission");
    state.result = { data: { auto_admission_paused: true }, error: null };
    expect(await aiMayAddKnowledge()).toBe(false);
  });

  it("fails closed when the setting is missing or cannot be read", async () => {
    const { aiMayAddKnowledge, clearAiKnowledgePermissionCache } = await import("@/lib/ai-knowledge-permission");
    state.result = { data: null, error: null };
    expect(await aiMayAddKnowledge()).toBe(false);
    clearAiKnowledgePermissionCache();
    state.result = { data: null, error: { message: "denied" } };
    expect(await aiMayAddKnowledge()).toBe(false);
    clearAiKnowledgePermissionCache();
    state.throws = true;
    expect(await aiMayAddKnowledge()).toBe(false);
  });

  it("applies a saved change on the next request once the cache is cleared", async () => {
    const { aiMayAddKnowledge, clearAiKnowledgePermissionCache } = await import("@/lib/ai-knowledge-permission");
    state.result = { data: { auto_admission_paused: true }, error: null };
    expect(await aiMayAddKnowledge()).toBe(false);
    state.result = { data: { auto_admission_paused: false }, error: null };
    expect(await aiMayAddKnowledge()).toBe(false);
    clearAiKnowledgePermissionCache();
    expect(await aiMayAddKnowledge()).toBe(true);
  });
});
