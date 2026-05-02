import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { itemsApi } from "../api/items";

// Helpers --------------------------------------------------------

function makeResponse(opts: {
  ok?: boolean;
  status?: number;
  body: unknown;
}): Response {
  const ok = opts.ok ?? true;
  const text = JSON.stringify(opts.body);
  return {
    ok,
    status: opts.status ?? (ok ? 200 : 500),
    statusText: ok ? "OK" : "Error",
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(opts.body),
  } as unknown as Response;
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

// getItems -------------------------------------------------------

describe("itemsApi.getItems", () => {
  it("calls /api/items with empty query when no params", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(makeResponse({ body: [] })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await itemsApi.getItems();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toMatch(/\/api\/items\?/);
  });

  it("encodes process_type_code, search, skip, limit", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(makeResponse({ body: [] })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await itemsApi.getItems({
      process_type_code: "TR",
      search: "튜브",
      skip: 10,
      limit: 50,
    });
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain("process_type_code=TR");
    expect(url).toContain("skip=10");
    expect(url).toContain("limit=50");
    // 한국어 search 는 URLSearchParams 가 인코딩
    expect(url).toMatch(/search=/);
  });

  it("encodes legacy filters with snake_case query keys", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(makeResponse({ body: [] })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await itemsApi.getItems({
      legacyFileType: "FILE_A",
      legacyPart: "PART_B",
      legacyModel: "DX3000",
      legacyItemType: "ITEM_C",
    });
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain("legacy_file_type=FILE_A");
    expect(url).toContain("legacy_part=PART_B");
    expect(url).toContain("legacy_model=DX3000");
    expect(url).toContain("legacy_item_type=ITEM_C");
  });

  it("forwards AbortSignal to fetcher", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(makeResponse({ body: [] })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const ctrl = new AbortController();
    await itemsApi.getItems({}, { signal: ctrl.signal });
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({ signal: ctrl.signal });
  });
});

// getItem -------------------------------------------------------

describe("itemsApi.getItem", () => {
  it("hits /api/items/{id}", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(makeResponse({ body: { item_id: "abc" } })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const result = await itemsApi.getItem("abc");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/items/abc");
    expect(result).toEqual({ item_id: "abc" });
  });
});

// createItem / updateItem ---------------------------------------

describe("itemsApi.createItem / updateItem", () => {
  it("createItem POSTs JSON to /api/items", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(makeResponse({ body: { item_id: "new" } })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await itemsApi.createItem({ item_name: "A" });
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ item_name: "A" });
  });

  it("updateItem PUTs to /api/items/{id} (R4-1 PUT 메서드 정합)", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(makeResponse({ body: { item_id: "abc" } })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await itemsApi.updateItem("abc", { process_type_code: "HF" });
    const url = String(fetchSpy.mock.calls[0][0]);
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(url).toContain("/api/items/abc");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ process_type_code: "HF" });
  });
});
