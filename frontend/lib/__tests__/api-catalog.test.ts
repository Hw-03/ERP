import { describe, it, expect, vi, afterEach } from "vitest";
import { catalogApi } from "../api/catalog";

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

describe("catalogApi.getModels", () => {
  it("GET /api/models", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse([])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await catalogApi.getModels();
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/models");
  });
});

describe("catalogApi.createModel", () => {
  it("POST /api/models with body", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({ slot: 1 })));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await catalogApi.createModel({ model_name: "M1" });
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ model_name: "M1" });
  });
});

describe("catalogApi.getBOM", () => {
  it("GET /api/bom/{parentId}", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse([])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await catalogApi.getBOM("item-1");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/bom/item-1");
  });
});

describe("catalogApi.updateBOM", () => {
  it("PATCH /api/bom/{bomId}", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await catalogApi.updateBOM("bom-1", { quantity: 5 });
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/bom/bom-1");
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ quantity: 5 });
  });
});

describe("catalogApi 잔여 메소드", () => {
  it("deleteModel DELETE /api/models/{slot}", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await catalogApi.deleteModel(3, "0000");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/models/3");
  });

  it("getAllBOM GET /api/bom", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse([])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await catalogApi.getAllBOM();
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/bom");
  });

  it("getBOMTree GET /api/bom/{id}/tree", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await catalogApi.getBOMTree("item-1");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/bom/item-1/tree");
  });

  it("getBOMWhereUsed GET /api/bom/where-used/{id}", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse([])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await catalogApi.getBOMWhereUsed("item-1");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/bom/where-used/item-1");
  });

  it("createBOM POST /api/bom", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await catalogApi.createBOM({
      parent_item_id: "p1",
      child_item_id: "c1",
      quantity: 2,
      unit: "EA",
    });
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/bom");
  });

  it("deleteBOM DELETE /api/bom/{id}", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await catalogApi.deleteBOM("bom-1");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/bom/bom-1");
  });
});
