import { describe, it, expect, vi, afterEach } from "vitest";
// @vitest-environment jsdom
import { shippingApi } from "../api/shipping";
import { ResultUnknownError } from "../api-core";
import type { components } from "../api/generated/openapi";
import type { ShippingRequest } from "../api/types/shipping";

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
const expectedUpdatedAt = "2026-09-01T00:00:00Z";

function shippingRequestResponse(
  overrides: Partial<components["schemas"]["ShippingRequestResponse"]> = {},
): components["schemas"]["ShippingRequestResponse"] {
  return {
    base_pf_item_id: "pf-1",
    base_pf_item_name: "PF",
    created_at: "2026-09-08T00:00:00Z",
    finalization_mode: "KEEP_BASE",
    request_id: "req-1",
    status: "PREPARING",
    updated_at: "2026-09-08T00:00:00Z",
    ...overrides,
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  sessionStorage.clear();
});

describe("shippingApi", () => {
  it("OpenAPI 응답의 finalization_mode를 required public 필드로 유지한다", () => {
    const required: undefined extends ShippingRequest["finalization_mode"] ? never : true = true;
    expect(required).toBe(true);
  });

  it("generated shipping raw 응답의 생략 nullable 필드를 public 기본값으로 정규화한다", async () => {
    const raw = {
      allocations: [{
        allocation_id: "allocation-1",
        created_at: "2026-09-08T00:00:00Z",
        item_id: "item-allocation",
        item_name: "포장재",
        quantity: 1,
        request_id: "req-1",
        status: "reserved",
      }],
      base_pf_item_id: "pf-1",
      base_pf_item_name: "Standard PF",
      bom_lines: [{
        child_item_id: "item-bom",
        item_name: "BOM 품목",
        line_id: "bom-line-1",
        parent_stage: "PA",
        quantity: 1,
        unit: "EA",
      }],
      checklist_lines: [],
      companion_lines: [],
      created_at: "2026-09-08T00:00:00Z",
      events: [],
      finalization_mode: "KEEP_BASE",
      request_id: "req-1",
      status: "PREPARING",
      stock_shortages: [],
      transaction_count: 0,
      transactions: [{
        created_at: "2026-09-08T00:00:00Z",
        item_id: "item-transaction",
        item_name: "출하 품목",
        log_id: "transaction-1",
        quantity_change: -1,
        transaction_type: "SHIP",
      }],
      updated_at: "2026-09-08T00:00:00Z",
    } satisfies components["schemas"]["ShippingRequestResponse"];
    globalThis.fetch = vi.fn(() => Promise.resolve(makeResponse(raw))) as unknown as typeof fetch;

    await expect(shippingApi.getShippingRequest("req-1")).resolves.toEqual(expect.objectContaining({
      finalization_mode: "KEEP_BASE",
      request_quantity: 1,
      base_pf_mes_code: null,
      final_pa_item_id: null,
      final_pa_item_name: null,
      final_pf_item_id: null,
      final_pf_item_name: null,
      requested_by_name: null,
      custom_pa_name: null,
      custom_pf_name: null,
      notes: null,
      serial_numbers: null,
      prepared_at: null,
      picked_up_at: null,
      bom_lines: [expect.objectContaining({ included: true, origin: "CUSTOM" })],
      transactions: [expect.objectContaining({ cancelled: false })],
      allocations: [expect.objectContaining({ unit: "EA" })],
    }));
  });

  it("creates a shipping request", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(shippingRequestResponse())));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await shippingApi.createShippingRequest({
      base_pf_item_id: "pf-1",
      requested_by_name: "shipping",
      request_quantity: 2,
      bom_lines: [{ parent_stage: "PA", child_item_id: "af-1", quantity: 1, unit: "EA" }],
      companion_lines: [{ item_id: "carton-1", quantity: 3, unit: "EA" }],
    });

    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/shipping/requests");
    expect((fetchSpy.mock.calls[0][1] as RequestInit).method).toBe("POST");
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.request_quantity).toBe(2);
    expect(body.companion_lines).toEqual([{ item_id: "carton-1", quantity: 3, unit: "EA" }]);
  });

  it("forwards caller cancellation to BOM matching", async () => {
    let requestSignal: AbortSignal | undefined;
    globalThis.fetch = vi.fn((_url, init) => {
      requestSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    }) as unknown as typeof fetch;
    const controller = new AbortController();

    const match = shippingApi.matchShippingBom({
      base_pf_item_id: "pf-1",
      bom_lines: [{ parent_stage: "PA", child_item_id: "af-1", quantity: 1 }],
    }, { signal: controller.signal });
    controller.abort();

    expect(requestSignal?.aborted).toBe(true);
    await expect(match).rejects.toBeInstanceOf(ResultUnknownError);
  });

  it("updates checklist and sends serial numbers when completing preparation", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(shippingRequestResponse())));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await shippingApi.updateShippingChecklist("req-1", {
      checks: [{ item_id: "item-1", checked: true }],
    });
    await shippingApi.prepareShippingComplete("req-1", {
      serial_numbers: "SN-001\nSN-002",
      companion_lines: [{ item_id: "item-legacy", quantity: 1, unit: "EA" }],
      expected_updated_at: expectedUpdatedAt,
    });

    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/shipping/requests/req-1/checklist");
    expect(String(fetchSpy.mock.calls[1][0])).toContain("/api/shipping/requests/req-1/prepare-complete");
    expect(JSON.parse((fetchSpy.mock.calls[1][1] as RequestInit).body as string)).toEqual({
      serial_numbers: "SN-001\nSN-002",
      companion_lines: [{ item_id: "item-legacy", quantity: 1, unit: "EA" }],
      client_request_id: expect.any(String),
      expected_status: "PREPARING",
      expected_updated_at: expectedUpdatedAt,
    });
  });

  it("sends a key and expected state for every shipping workflow command", async () => {
    const fetchSpy = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(makeResponse(shippingRequestResponse())),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await shippingApi.cancelShippingPrepare("req-1", {
      reason: "retry",
      expected_updated_at: expectedUpdatedAt,
    });
    await shippingApi.completeShippingPickup("req-1", {
      expected_updated_at: expectedUpdatedAt,
    });
    await shippingApi.cancelShippingPickup("req-1", {
      expected_updated_at: expectedUpdatedAt,
    });

    const bodies = fetchSpy.mock.calls.map((call) =>
      JSON.parse(String(call[1]?.body)),
    );
    expect(bodies).toEqual([
      {
        reason: "retry",
        client_request_id: expect.any(String),
        expected_status: "PREPARED",
        expected_updated_at: expectedUpdatedAt,
      },
      {
        client_request_id: expect.any(String),
        expected_status: "PREPARED",
        expected_updated_at: expectedUpdatedAt,
      },
      {
        client_request_id: expect.any(String),
        expected_status: "PICKED_UP",
        expected_updated_at: expectedUpdatedAt,
      },
    ]);
  });

  it("retries an unknown preparation result with the exact transport payload", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    let call = 0;
    globalThis.fetch = vi.fn((_url, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      call += 1;
      return call === 1
        ? Promise.reject(new TypeError("lost response"))
        : Promise.resolve(makeResponse(shippingRequestResponse({ request_id: "req-1" })));
    }) as unknown as typeof fetch;

    await expect(
      shippingApi.prepareShippingComplete("req-1", {
        serial_numbers: "SN-ORIGINAL",
        expected_updated_at: expectedUpdatedAt,
      }),
    ).rejects.toBeInstanceOf(ResultUnknownError);
    await shippingApi.prepareShippingComplete("req-1", {
      serial_numbers: "SN-CHANGED",
      expected_updated_at: "2026-09-01T00:01:00Z",
    });

    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[0]).toEqual({
      serial_numbers: "SN-ORIGINAL",
      client_request_id: expect.any(String),
      expected_status: "PREPARING",
      expected_updated_at: expectedUpdatedAt,
    });
  });

  it("discards an unknown prepare key after the inverse transition succeeds", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    let call = 0;
    globalThis.fetch = vi.fn((_url, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      call += 1;
      return call === 1
        ? Promise.reject(new TypeError("lost prepare response"))
        : Promise.resolve(makeResponse(shippingRequestResponse({ request_id: "req-1" })));
    }) as unknown as typeof fetch;

    await expect(
      shippingApi.prepareShippingComplete("req-1", { serial_numbers: "SN-OLD" }),
    ).rejects.toBeInstanceOf(ResultUnknownError);
    await shippingApi.cancelShippingPrepare("req-1", { reason: "confirmed inverse" });
    await shippingApi.prepareShippingComplete("req-1", { serial_numbers: "SN-NEW" });

    expect(bodies[2]).toEqual({
      serial_numbers: "SN-NEW",
      client_request_id: expect.any(String),
      expected_status: "PREPARING",
    });
    expect(bodies[2].client_request_id).not.toBe(bodies[0].client_request_id);
  });

  it("discards an unknown pickup key after the inverse transition succeeds", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    let call = 0;
    globalThis.fetch = vi.fn((_url, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      call += 1;
      return call === 1
        ? Promise.reject(new TypeError("lost pickup response"))
        : Promise.resolve(makeResponse(shippingRequestResponse({ request_id: "req-1" })));
    }) as unknown as typeof fetch;

    await expect(
      shippingApi.completeShippingPickup("req-1"),
    ).rejects.toBeInstanceOf(ResultUnknownError);
    await shippingApi.cancelShippingPickup("req-1");
    await shippingApi.completeShippingPickup("req-1");

    expect(bodies[2]).toEqual({
      client_request_id: expect.any(String),
      expected_status: "PREPARED",
    });
    expect(bodies[2].client_request_id).not.toBe(bodies[0].client_request_id);
  });

  it("does not reuse another operator's unknown shipping command", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    let call = 0;
    globalThis.fetch = vi.fn((_url, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      call += 1;
      return call === 1
        ? Promise.reject(new TypeError("lost actor A response"))
        : Promise.resolve(makeResponse(shippingRequestResponse({ request_id: "req-1" })));
    }) as unknown as typeof fetch;

    await expect(
      shippingApi.prepareShippingComplete(
        "req-1",
        { serial_numbers: "SN-A" },
        "actor-a",
      ),
    ).rejects.toBeInstanceOf(ResultUnknownError);
    await shippingApi.prepareShippingComplete(
      "req-1",
      { serial_numbers: "SN-B" },
      "actor-b",
    );

    expect(bodies[1]).toEqual({
      serial_numbers: "SN-B",
      client_request_id: expect.any(String),
      expected_status: "PREPARING",
    });
    expect(bodies[1].client_request_id).not.toBe(bodies[0].client_request_id);
  });

  it("필수 mutation 응답 누락도 결과 불명으로 보존해 같은 command를 재시도한다", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    let call = 0;
    globalThis.fetch = vi.fn((_url, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      call += 1;
      return Promise.resolve(makeResponse(call === 1 ? {} : shippingRequestResponse()));
    }) as unknown as typeof fetch;

    await expect(shippingApi.prepareShippingComplete("req-required", {
      serial_numbers: "SN-ORIGINAL",
    })).rejects.toBeInstanceOf(ResultUnknownError);
    await shippingApi.prepareShippingComplete("req-required", {
      serial_numbers: "SN-CHANGED",
    });

    expect(bodies[1]).toEqual(bodies[0]);
  });

  it.each([
    ["allocations", { allocations: [{}] }],
    ["bom_lines", { bom_lines: [{}] }],
    ["checklist_lines", { checklist_lines: [{}] }],
    ["companion_lines", { companion_lines: [{}] }],
    ["events", { events: [{}] }],
    ["stock_shortages", { stock_shortages: [{}] }],
    ["transactions", { transactions: [{}] }],
    ["latest_preparation_revision", { latest_preparation_revision: { changes: [] } }],
  ])("%s 중첩 필수 응답 누락도 같은 command로 재시도한다", async (name, invalidNested) => {
    const bodies: Array<Record<string, unknown>> = [];
    let call = 0;
    globalThis.fetch = vi.fn((_url, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      call += 1;
      return Promise.resolve(makeResponse(call === 1
        ? { ...shippingRequestResponse(), ...invalidNested }
        : shippingRequestResponse()));
    }) as unknown as typeof fetch;

    await expect(shippingApi.prepareShippingComplete(`req-nested-${name}`, {
      serial_numbers: "SN-ORIGINAL",
    })).rejects.toBeInstanceOf(ResultUnknownError);
    await shippingApi.prepareShippingComplete(`req-nested-${name}`, {
      serial_numbers: "SN-CHANGED",
    });

    expect(bodies[1]).toEqual(bodies[0]);
  });

  it.each([
    {
      name: "prepare complete",
      first: () => shippingApi.prepareShippingComplete("req-decode-prepare", {
        serial_numbers: "SN-ORIGINAL",
      }),
      second: () => shippingApi.prepareShippingComplete("req-decode-prepare", {
        serial_numbers: "SN-CHANGED",
      }),
    },
    {
      name: "prepare cancel",
      first: () => shippingApi.cancelShippingPrepare("req-decode-cancel", {
        reason: "original",
      }),
      second: () => shippingApi.cancelShippingPrepare("req-decode-cancel", {
        reason: "changed",
      }),
    },
    {
      name: "pickup complete",
      first: () => shippingApi.completeShippingPickup("req-decode-pickup", {
        expected_updated_at: "2026-09-08T00:00:00Z",
      }),
      second: () => shippingApi.completeShippingPickup("req-decode-pickup", {
        expected_updated_at: "2026-09-08T00:01:00Z",
      }),
    },
    {
      name: "pickup cancel",
      first: () => shippingApi.cancelShippingPickup("req-decode-pickup-cancel", {
        expected_updated_at: "2026-09-08T00:00:00Z",
      }),
      second: () => shippingApi.cancelShippingPickup("req-decode-pickup-cancel", {
        expected_updated_at: "2026-09-08T00:01:00Z",
      }),
    },
  ])("$name decode 실패도 결과 불명으로 보존해 같은 command를 재시도한다", async ({ first, second }) => {
    const bodies: Array<Record<string, unknown>> = [];
    let call = 0;
    globalThis.fetch = vi.fn((_url, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      call += 1;
      return Promise.resolve(makeResponse(call === 1
        ? { ...shippingRequestResponse(), bom_lines: [{ parent_stage: "FUTURE" }] }
        : shippingRequestResponse()));
    }) as unknown as typeof fetch;

    await expect(first()).rejects.toBeInstanceOf(ResultUnknownError);
    await second();

    expect(bodies[1]).toEqual(bodies[0]);
  });

  it("prepare decode 실패는 기존 cancel inverse key를 지우지 않는다", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    let call = 0;
    globalThis.fetch = vi.fn((_url, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      call += 1;
      if (call === 1) return Promise.reject(new TypeError("lost cancel response"));
      if (call === 2) {
        return Promise.resolve(makeResponse({
          ...shippingRequestResponse(),
          bom_lines: [{ parent_stage: "FUTURE" }],
        }));
      }
      return Promise.resolve(makeResponse(shippingRequestResponse()));
    }) as unknown as typeof fetch;

    await expect(shippingApi.cancelShippingPrepare("req-inverse", {
      reason: "original cancel",
    })).rejects.toBeInstanceOf(ResultUnknownError);
    await expect(shippingApi.prepareShippingComplete("req-inverse", {
      serial_numbers: "SN-DECODE",
    })).rejects.toBeInstanceOf(ResultUnknownError);
    await shippingApi.cancelShippingPrepare("req-inverse", { reason: "changed cancel" });

    expect(bodies[2]).toEqual(bodies[0]);
  });

  it("pickup decode 실패는 기존 pickup-cancel inverse key를 지우지 않는다", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    let call = 0;
    globalThis.fetch = vi.fn((_url, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      call += 1;
      if (call === 1) return Promise.reject(new TypeError("lost pickup cancel response"));
      if (call === 2) {
        return Promise.resolve(makeResponse({
          ...shippingRequestResponse(),
          bom_lines: [{ parent_stage: "FUTURE" }],
        }));
      }
      return Promise.resolve(makeResponse(shippingRequestResponse()));
    }) as unknown as typeof fetch;

    await expect(shippingApi.cancelShippingPickup("req-pickup-inverse", {
      expected_updated_at: "2026-09-08T00:00:00Z",
    })).rejects.toBeInstanceOf(ResultUnknownError);
    await expect(shippingApi.completeShippingPickup("req-pickup-inverse", {
      expected_updated_at: "2026-09-08T00:01:00Z",
    })).rejects.toBeInstanceOf(ResultUnknownError);
    await shippingApi.cancelShippingPickup("req-pickup-inverse", {
      expected_updated_at: "2026-09-08T00:02:00Z",
    });

    expect(bodies[2]).toEqual(bodies[0]);
  });

  it("lists history and filters request status", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse([])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await shippingApi.getShippingRequests({ status: "PREPARING" });
    await shippingApi.getShippingHistory({ status: "PICKED_UP", year: 2026, month: 7, q: "INV-", cursor: "next", limit: 50 });

    expect(String(fetchSpy.mock.calls[0][0])).toContain("status=PREPARING");
    const historyUrl = String(fetchSpy.mock.calls[1][0]);
    expect(historyUrl).toContain("/api/shipping/history?");
    expect(historyUrl).toContain("status=PICKED_UP");
    expect(historyUrl).toContain("year=2026");
    expect(historyUrl).toContain("month=7");
    expect(historyUrl).toContain("q=INV-");
    expect(historyUrl).toContain("cursor=next");
    expect(historyUrl).toContain("limit=50");
  });

  it("reads an active request page with its stable cursor contract", async () => {
    const page = { requests: [{ request_id: "req-1" }], next_cursor: "next", has_more: true };
    const fetchSpy = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => Promise.resolve(makeResponse(page)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await expect(shippingApi.getShippingRequestPage({
      status: "PREPARING",
      cursor: "cursor-1",
      limit: 25,
    })).resolves.toEqual(expect.objectContaining({
      next_cursor: "next",
      has_more: true,
      requests: [expect.objectContaining({ request_id: "req-1" })],
    }));

    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain("/api/shipping/requests/page?");
    expect(url).toContain("status=PREPARING");
    expect(url).toContain("cursor=cursor-1");
    expect(url).toContain("limit=25");
  });

  it("reads one shipping request by id with an abort signal", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({ request_id: "req-old" })));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const controller = new AbortController();

    await shippingApi.getShippingRequest("req-old", { signal: controller.signal });

    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/shipping/requests/req-old");
    expect(fetchSpy.mock.calls[0][1]).toEqual(expect.objectContaining({ signal: controller.signal }));
  });

  it("keeps the unfiltered history call compatible with the mobile row list", async () => {
    const rows = [{ request_id: "hist-1" }];
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({ requests: rows, next_cursor: null, has_more: false })));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await expect(shippingApi.getShippingHistory()).resolves.toEqual([
      expect.objectContaining({ request_id: "hist-1" }),
    ]);
  });

  it("updates invoice and reads revisions and history months", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(shippingRequestResponse())));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await shippingApi.updateShippingInvoice("req-1", " inv-001 ");
    await shippingApi.getShippingRevisions("req-1");
    await shippingApi.getShippingHistoryMonths({ status: "CANCELLED", year: 2026 });

    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/shipping/requests/req-1/invoice");
    expect((fetchSpy.mock.calls[0][1] as RequestInit).method).toBe("PATCH");
    expect(JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)).toEqual({ invoice_number: " inv-001 " });
    expect(String(fetchSpy.mock.calls[1][0])).toContain("/api/shipping/requests/req-1/revisions");
    expect(String(fetchSpy.mock.calls[2][0])).toContain("/api/shipping/history/months?status=CANCELLED&year=2026");
  });
});
