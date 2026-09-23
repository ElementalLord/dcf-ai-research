import { afterEach, describe, expect, it, vi } from "vitest";
import { CorpusError } from "@/lib/corpus/errors";
import { corpusErrorResponse } from "@/lib/corpus/api";
import { fetchJsonWithTimeout } from "@/lib/client/fetch-json";

afterEach(() => vi.restoreAllMocks());

describe("API errors and browser timeouts", () => {
  it("returns structured JSON errors", async () => {
    const response = corpusErrorResponse(new CorpusError("GEMINI_FAILED", "Generation failed safely.", 502));
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: { code: "GEMINI_FAILED", message: "Generation failed safely." } });
  });

  it("aborts a fetch so loading can always settle", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }),
    );
    await expect(fetchJsonWithTimeout("https://example.invalid", {}, 5)).rejects.toMatchObject({ name: "AbortError" });
  });
});
