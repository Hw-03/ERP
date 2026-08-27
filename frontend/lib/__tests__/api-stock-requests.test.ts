// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from "vitest";
import { stockRequestsApi } from "../api/stock-requests";
import { ResultUnknownError } from "../api-core";

function makeResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? "OK" : "Error",
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function hasPendingStorage(namespace: string): boolean {
  const prefix = `${namespace}:`;
  return Array.from({ length: sessionStorage.length }, (_, index) =>
    sessionStorage.key(index)).some((key) => key?.startsWith(prefix));
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  sessionStorage.clear();
});

describe("stockRequestsApi", () => {
  it("createStockRequest POST /api/stock-requests", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await stockRequestsApi.createStockRequest({
      requester_employee_id: "e1",
      request_type: "raw_receive",
      reference_no: null,
      notes: null,
      lines: [],
    });
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/stock-requests");
  });

  it("transport uncertainty 뒤 동일 payload의 key와 본문을 보존한다", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    let call = 0;
    globalThis.fetch = vi.fn((_url, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      call += 1;
      return call === 1
        ? Promise.reject(new TypeError("lost response"))
        : Promise.resolve(makeResponse({ request_id: "r-1" }));
    }) as unknown as typeof fetch;
    const payload = {
      requester_employee_id: "employee-uncertain",
      request_type: "raw_receive" as const,
      reference_no: "uncertain-1",
      lines: [{
        item_id: "item-1",
        quantity: 1,
        from_bucket: "none" as const,
        to_bucket: "warehouse" as const,
      }],
    };

    await expect(stockRequestsApi.createStockRequest(payload)).rejects.toBeInstanceOf(
      ResultUnknownError,
    );
    await stockRequestsApi.createStockRequest({
      ...payload,
      reason_category: "changed category",
      reason_memo: "changed reason",
    });

    expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[0].client_request_id).toEqual(expect.any(String));
  });

  it("module reload 뒤에도 session snapshot의 exact 요청을 복원한다", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    let call = 0;
    globalThis.fetch = vi.fn((_url, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      call += 1;
      return call === 1
        ? Promise.reject(new TypeError("lost response before reload"))
        : Promise.resolve(makeResponse({ request_id: "r-reloaded" }));
    }) as unknown as typeof fetch;
    const payload = {
      requester_employee_id: "employee-reload",
      request_type: "raw_receive" as const,
      notes: "before reload",
      lines: [{
        item_id: "item-reload",
        quantity: 1,
        from_bucket: "none" as const,
        to_bucket: "warehouse" as const,
      }],
    };

    await expect(stockRequestsApi.createStockRequest(payload)).rejects.toBeInstanceOf(
      ResultUnknownError,
    );
    expect(hasPendingStorage("s")).toBe(true);
    vi.resetModules();
    const reloadedApi = (await import("../api/stock-requests")).stockRequestsApi;
    await reloadedApi.createStockRequest({
      ...payload,
      notes: "changed after reload",
      lines: [{ ...payload.lines[0], quantity: 9 }],
    });

    expect(bodies[1]).toEqual(bodies[0]);
    expect(hasPendingStorage("s")).toBe(false);
  });

  it("성공 뒤 같은 payload는 새 key로 새 명령이 된다", async () => {
    const keys: unknown[] = [];
    globalThis.fetch = vi.fn((_url, init) => {
      keys.push((JSON.parse(String(init?.body)) as Record<string, unknown>).client_request_id);
      return Promise.resolve(makeResponse({ request_id: "r-success" }));
    }) as unknown as typeof fetch;
    const payload = {
      requester_employee_id: "employee-success",
      request_type: "raw_receive" as const,
      reference_no: "success-boundary",
      lines: [{
        item_id: "item-success",
        quantity: 1,
        from_bucket: "none" as const,
        to_bucket: "warehouse" as const,
      }],
    };

    await stockRequestsApi.createStockRequest(payload);
    await stockRequestsApi.createStockRequest(payload);

    expect(keys[0]).not.toBe(keys[1]);
  });

  it("확정 422 뒤에는 key를 폐기하고 수정 제출을 허용한다", async () => {
    const keys: unknown[] = [];
    let call = 0;
    globalThis.fetch = vi.fn((_url, init) => {
      keys.push((JSON.parse(String(init?.body)) as Record<string, unknown>).client_request_id);
      call += 1;
      if (call === 1) {
        return Promise.resolve({
          ok: false,
          status: 422,
          statusText: "Unprocessable Entity",
          text: () => Promise.resolve(JSON.stringify({ detail: "invalid" })),
        } as Response);
      }
      return Promise.resolve(makeResponse({ request_id: "r-after-422" }));
    }) as unknown as typeof fetch;
    const payload = {
      requester_employee_id: "employee-definitive",
      request_type: "raw_receive" as const,
      reference_no: "definitive-boundary",
      lines: [{
        item_id: "item-definitive",
        quantity: 1,
        from_bucket: "none" as const,
        to_bucket: "warehouse" as const,
      }],
    };

    await expect(stockRequestsApi.createStockRequest(payload)).rejects.toMatchObject({
      status: 422,
    });
    await stockRequestsApi.createStockRequest(payload);

    expect(keys[0]).not.toBe(keys[1]);
  });

  it("5xx 뒤에는 같은 key와 exact payload를 보존한다", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    let call = 0;
    globalThis.fetch = vi.fn((_url, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      call += 1;
      if (call === 1) {
        return Promise.resolve({
          ok: false,
          status: 503,
          statusText: "Unavailable",
          text: () => Promise.resolve(JSON.stringify({ detail: "busy" })),
        } as Response);
      }
      return Promise.resolve(makeResponse({ request_id: "r-after-503" }));
    }) as unknown as typeof fetch;
    const payload = {
      requester_employee_id: "employee-retryable",
      request_type: "raw_receive" as const,
      reference_no: "retryable-boundary",
      lines: [{
        item_id: "item-retryable",
        quantity: 1,
        from_bucket: "none" as const,
        to_bucket: "warehouse" as const,
      }],
    };

    await expect(stockRequestsApi.createStockRequest(payload)).rejects.toMatchObject({
      status: 503,
    });
    await stockRequestsApi.createStockRequest({ ...payload, reference_no: "changed" });

    expect(bodies[1]).toEqual(bodies[0]);
  });

  it("한 폼의 결과 불명이 다른 재고 대상 폼의 명령을 가로채지 않는다", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    let call = 0;
    globalThis.fetch = vi.fn((_url, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      call += 1;
      return call === 1
        ? Promise.reject(new TypeError("lost first form response"))
        : Promise.resolve(makeResponse({ request_id: `request-${call}` }));
    }) as unknown as typeof fetch;
    const firstForm = {
      requester_employee_id: "employee-two-forms",
      request_type: "raw_receive" as const,
      lines: [{
        item_id: "item-form-a",
        quantity: 1,
        from_bucket: "none" as const,
        to_bucket: "warehouse" as const,
      }],
    };
    const secondForm = {
      ...firstForm,
      lines: [{
        ...firstForm.lines[0],
        item_id: "item-form-b",
      }],
    };

    await expect(stockRequestsApi.createStockRequest(firstForm)).rejects.toBeInstanceOf(
      ResultUnknownError,
    );
    await stockRequestsApi.createStockRequest(secondForm);
    await stockRequestsApi.createStockRequest({
      ...firstForm,
      lines: [{ ...firstForm.lines[0], quantity: 9 }],
    });

    expect(bodies[1]).not.toEqual(bodies[0]);
    expect((bodies[1].lines as Array<Record<string, unknown>>)[0].item_id).toBe(
      "item-form-b",
    );
    expect(bodies[2]).toEqual(bodies[0]);
  });

  it("같은 command scope의 동시 호출은 하나의 전송 결과를 공유한다", async () => {
    const resolvers: Array<(response: Response) => void> = [];
    const fetchSpy = vi.fn(
      () => new Promise<Response>((resolve) => resolvers.push(resolve)),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const payload = {
      requester_employee_id: "employee-concurrent",
      request_type: "raw_receive" as const,
      notes: "first",
      lines: [{
        item_id: "item-concurrent",
        quantity: 1,
        from_bucket: "none" as const,
        to_bucket: "warehouse" as const,
      }],
    };

    const first = stockRequestsApi.createStockRequest(payload);
    const second = stockRequestsApi.createStockRequest({
      ...payload,
      notes: "changed",
      lines: [{ ...payload.lines[0], quantity: 9 }],
    });
    resolvers.forEach((resolve) => resolve(makeResponse({ request_id: "r-shared" })));
    await Promise.all([first, second]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("listMyStockRequests encodes employeeId", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse([])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await stockRequestsApi.listMyStockRequests("E 1");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("requester_employee_id=E%201");
  });

  it("listWarehouseQueue GET /api/stock-requests/warehouse-queue", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse([])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await stockRequestsApi.listWarehouseQueue();
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/stock-requests/warehouse-queue");
  });

  it("approveStockRequest POST /{id}/approve", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await stockRequestsApi.approveStockRequest("r-1", { actor_employee_id: "e1", pin: "0000" });
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/stock-requests/r-1/approve");
  });

  it("submitStockRequestDraft POST /{id}/submit", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await stockRequestsApi.submitStockRequestDraft("r-1", "e-1");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/stock-requests/r-1/submit");
  });

  it("deleteStockRequestDraft DELETE with employeeId in query", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await stockRequestsApi.deleteStockRequestDraft("r-1", "e-1");
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain("/api/stock-requests/draft/r-1");
    expect(url).toContain("requester_employee_id=e-1");
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("DELETE");
  });

  it("rejectStockRequest POST /{id}/reject", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await stockRequestsApi.rejectStockRequest("r-1", { actor_employee_id: "e1", pin: "0000" });
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/stock-requests/r-1/reject");
  });

  it("cancelStockRequest POST /{id}/cancel", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await stockRequestsApi.cancelStockRequest("r-1", { actor_employee_id: "e1", pin: "0000" });
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/stock-requests/r-1/cancel");
  });

  it("getItemReservations GET /reservations?item_id=", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse([])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await stockRequestsApi.getItemReservations("i-1");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/stock-requests/reservations");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("item_id=i-1");
  });

  it("upsertStockRequestDraft PUT /api/stock-requests/draft", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await stockRequestsApi.upsertStockRequestDraft({
      requester_employee_id: "e1",
      request_type: "raw_receive",
      reference_no: null,
      notes: null,
      lines: [],
    });
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("PUT");
  });

  it("getStockRequestDraft encodes both params", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(null)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await stockRequestsApi.getStockRequestDraft("e-1", "raw_receive");
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain("requester_employee_id=e-1");
    expect(url).toContain("request_type=raw_receive");
  });

  it("listStockRequestDrafts GET /drafts?requester_employee_id=", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse([])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await stockRequestsApi.listStockRequestDrafts("e-1");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/stock-requests/drafts");
  });
});
