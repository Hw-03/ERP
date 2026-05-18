import { describe, it, expect, vi, afterEach } from "vitest";
import { ioApi } from "../api/io";

// ── helpers ──────────────────────────────────────────────────────────────────

function makeResponse(body: unknown, ok = true, status?: number): Response {
  const st = status ?? (ok ? 200 : 500);
  return {
    ok,
    status: st,
    statusText: ok ? "OK" : "Error",
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ── preview ──────────────────────────────────────────────────────────────────

describe("ioApi.preview", () => {
  it("POST /api/io/preview with correct body shape", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({ bundles: [] })));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await ioApi.preview({
      work_type: "receive",
      sub_type: "receive_supplier",
      targets: [{ source_kind: "direct_item", item_id: "i-1", quantity: 3 }],
    });

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/io/preview");
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.work_type).toBe("receive");
    expect(body.sub_type).toBe("receive_supplier");
    expect(body.targets).toHaveLength(1);
  });

  it("throws on non-2xx (409 conflict)", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(
        makeResponse({ detail: { message: "충돌 발생" } }, false, 409),
      ),
    ) as unknown as typeof fetch;

    await expect(
      ioApi.preview({
        work_type: "warehouse_io",
        sub_type: "warehouse_to_dept",
        targets: [],
      }),
    ).rejects.toThrow("충돌 발생");
  });
});

// ── submit ───────────────────────────────────────────────────────────────────

describe("ioApi.submit", () => {
  it("POST /api/io/submit with draft payload", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(
        makeResponse({ batch: {}, status: "submitted", requires_approval: false, stock_request_id: null, message: "ok" }),
      ),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await ioApi.submit({
      requester_employee_id: "e-1",
      work_type: "receive",
      sub_type: "receive_supplier",
      bundles: [],
    });

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/io/submit");
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.requester_employee_id).toBe("e-1");
  });

  it("throws on 503 service unavailable", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(
        makeResponse({ detail: { message: "서버 불가" } }, false, 503),
      ),
    ) as unknown as typeof fetch;

    await expect(
      ioApi.submit({
        requester_employee_id: "e-1",
        work_type: "receive",
        sub_type: "receive_supplier",
        bundles: [],
      }),
    ).rejects.toThrow("서버 불가");
  });
});

// ── saveDraft ─────────────────────────────────────────────────────────────────

describe("ioApi.saveDraft", () => {
  it("PUT /api/io/draft", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({ batch_id: "b-1" })));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await ioApi.saveDraft({
      requester_employee_id: "e-1",
      work_type: "receive",
      sub_type: "receive_supplier",
      bundles: [],
    });

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/io/draft");
    expect((init as RequestInit).method).toBe("PUT");
  });
});

// ── getDraft ──────────────────────────────────────────────────────────────────

describe("ioApi.getDraft", () => {
  it("GET /api/io/draft with required query params", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(null)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await ioApi.getDraft("e-1", "receive");

    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain("/api/io/draft");
    expect(url).toContain("requester_employee_id=e-1");
    expect(url).toContain("work_type=receive");
  });

  it("GET /api/io/draft appends sub_type when provided", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(null)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await ioApi.getDraft("e-2", "warehouse_io", "warehouse_to_dept");

    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain("sub_type=warehouse_to_dept");
  });
});

// ── listDrafts ────────────────────────────────────────────────────────────────

describe("ioApi.listDrafts", () => {
  it("GET /api/io/drafts with employeeId encoded", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse([])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await ioApi.listDrafts("e 1");

    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain("/api/io/drafts");
    expect(url).toContain("requester_employee_id=e%201");
  });
});

// ── deleteDraft ───────────────────────────────────────────────────────────────

describe("ioApi.deleteDraft", () => {
  it("DELETE /api/io/draft/{batchId} with employeeId query", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(null)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await ioApi.deleteDraft("b-1", "e-1");

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/io/draft/b-1");
    expect(url).toContain("requester_employee_id=e-1");
    expect((init as RequestInit).method).toBe("DELETE");
  });
});

// ── submitDraft ───────────────────────────────────────────────────────────────

describe("ioApi.submitDraft", () => {
  it("POST /api/io/draft/{batchId}/submit with employeeId query", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(
        makeResponse({ batch: {}, status: "submitted", requires_approval: false, stock_request_id: null, message: "ok" }),
      ),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await ioApi.submitDraft("b-1", "e-1");

    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/io/draft/b-1/submit");
    expect(url).toContain("requester_employee_id=e-1");
  });
});

// ── getBatch ──────────────────────────────────────────────────────────────────

describe("ioApi.getBatch", () => {
  it("GET /api/io/{batchId}", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({ batch_id: "b-1" })));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await ioApi.getBatch("b-1");

    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain("/api/io/b-1");
  });

  it("throws on non-2xx (404 not found)", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(
        makeResponse({ detail: { message: "배치를 찾을 수 없습니다." } }, false, 404),
      ),
    ) as unknown as typeof fetch;

    await expect(ioApi.getBatch("missing-id")).rejects.toThrow("배치를 찾을 수 없습니다.");
  });
});
