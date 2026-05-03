import { describe, it, expect, vi, afterEach } from "vitest";
import { queueApi } from "../api/queue";

function makeResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? "OK" : "Error",
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("queueApi", () => {
  it("createQueueBatch POST /api/queue", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await queueApi.createQueueBatch({ batch_type: "production" });
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/queue");
  });

  it("listQueueBatches with status filter → query string", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse([])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await queueApi.listQueueBatches({ status: "draft" });
    expect(String(fetchSpy.mock.calls[0][0])).toContain("status=draft");
  });

  it("toggleQueueLine POST /api/queue/{b}/lines/{l}/toggle", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await queueApi.toggleQueueLine("b1", "l1", { included: false });
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/queue/b1/lines/l1/toggle");
  });

  it("confirmQueueBatch POST /api/queue/{b}/confirm", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await queueApi.confirmQueueBatch("b1");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/queue/b1/confirm");
  });

  it("deleteQueueLine DELETE /api/queue/{b}/lines/{l}", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await queueApi.deleteQueueLine("b1", "l1");
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("DELETE");
  });

  it("getQueueBatch GET /api/queue/{b}", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await queueApi.getQueueBatch("b1");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/queue/b1");
  });

  it("overrideQueueLine PUT /api/queue/{b}/lines/{l}", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await queueApi.overrideQueueLine("b1", "l1", 5);
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ quantity: 5 });
  });

  it("addQueueLine POST /api/queue/{b}/lines", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await queueApi.addQueueLine("b1", { item_id: "i1", direction: "in", quantity: 1 });
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/queue/b1/lines");
  });

  it("cancelQueueBatch POST /api/queue/{b}/cancel", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await queueApi.cancelQueueBatch("b1");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/queue/b1/cancel");
  });
});
