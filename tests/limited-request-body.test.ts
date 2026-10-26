import { describe, expect, it } from "vitest";
import { readLimitedBody, RequestBodyTooLarge } from "@/lib/limited-request-body";

describe("bounded request bodies", () => {
  it("stops a chunked request without Content-Length after the limit", async () => {
    let delivered = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        delivered += 1;
        controller.enqueue(new Uint8Array(600));
      },
    });
    const request = new Request("https://example.org/api/ask", { method: "POST", body, duplex: "half" } as RequestInit);
    await expect(readLimitedBody(request, 1000)).rejects.toBeInstanceOf(RequestBodyTooLarge);
    expect(delivered).toBeLessThanOrEqual(3);
  });
});
