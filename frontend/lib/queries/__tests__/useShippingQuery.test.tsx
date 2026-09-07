/**
 * useShippingQuery — 출하 탭 React Query 이관 테스트.
 *
 * 좌측 사이드바 탭 재방문 시 캐시 히트로 재요청 없이 즉시 렌더되는지 검증.
 * (useModelsQuery.test.tsx 패턴)
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { ShippingRequest } from "@/lib/api";
import type { components } from "@/lib/api/generated/openapi";
import {
  upsertShippingPageRequest,
  useShippingRequestPagesQuery,
  useShippingRequestsQuery,
} from "../useShippingQuery";
import { invalidateOperationalQueries } from "../realtime";

function makeResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? "OK" : "Error",
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function makeClient(overrides?: { gcTime?: number; staleTime?: number }) {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: overrides?.gcTime ?? 0,
        staleTime: overrides?.staleTime ?? 0,
      },
    },
  });
}

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function shippingFixture(
  requestId: string,
  status: ShippingRequest["status"],
  basePfItemId: string,
) {
  const raw = {
    base_pf_item_id: basePfItemId,
    base_pf_item_name: `PF ${basePfItemId}`,
    created_at: "2026-09-08T00:00:00Z",
    finalization_mode: "KEEP_BASE",
    request_id: requestId,
    status,
    updated_at: "2026-09-08T00:00:00Z",
  } satisfies components["schemas"]["ShippingRequestResponse"];
  const expected: ShippingRequest = {
    ...raw,
    allocations: [],
    base_pf_mes_code: null,
    bom_lines: [],
    checklist_lines: [],
    companion_lines: [],
    custom_pa_name: null,
    custom_pf_name: null,
    events: [],
    final_pa_item_id: null,
    final_pa_item_name: null,
    final_pf_item_id: null,
    final_pf_item_name: null,
    latest_preparation_revision: null,
    notes: null,
    picked_up_at: null,
    prepared_at: null,
    request_quantity: 1,
    requested_by_name: null,
    serial_numbers: null,
    stock_shortages: [],
    transaction_count: 0,
    transactions: [],
  };
  return { raw, expected };
}

const firstRequest = shippingFixture("req-1", "PREPARING", "pf-1");
const sampleResponses = [firstRequest.raw];
const sampleRequests = [firstRequest.expected];

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("useShippingRequestsQuery", () => {
  it("마운트 시 GET /api/shipping/requests 호출 + data 반환", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(sampleResponses)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient();
    const { result } = renderHook(() => useShippingRequestsQuery(), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.data).toEqual(sampleRequests));
    expect(result.current.data).toEqual(sampleRequests);
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/shipping/requests");
  });

  it("탭 재마운트 시(같은 QueryClient) 캐시 히트로 재요청 없음", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(sampleResponses)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient({ gcTime: 5 * 60_000, staleTime: 5 * 60_000 });
    const { result, unmount } = renderHook(() => useShippingRequestsQuery(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const callCountAfterFirstMount = fetchSpy.mock.calls.length;

    unmount();

    const { result: result2 } = renderHook(() => useShippingRequestsQuery(), {
      wrapper: makeWrapper(client),
    });

    expect(result2.current.isLoading).toBe(false);
    expect(result2.current.data).toEqual(sampleRequests);
    expect(fetchSpy.mock.calls.length).toBe(callCountAfterFirstMount);
  });
});

describe("useShippingRequestPagesQuery", () => {
  it("seeds a first page when a mutation completes before the initial list request", () => {
    const next = sampleRequests[0];

    expect(upsertShippingPageRequest(undefined, next)).toEqual({
      pages: [{ requests: [next], next_cursor: null, has_more: false }],
      pageParams: [null],
    });
  });

  it("loads the next cursor page and de-duplicates a boundary row", async () => {
    const secondRequest = shippingFixture("req-2", "PREPARED", "pf-2");
    const fetchSpy = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      return Promise.resolve(makeResponse(url.includes("cursor=next")
        ? { requests: [sampleResponses[0], secondRequest.raw], next_cursor: null, has_more: false }
        : { requests: sampleResponses, next_cursor: "next", has_more: true }));
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient();
    const { result } = renderHook(() => useShippingRequestPagesQuery(), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.requests).toEqual(sampleRequests));
    expect(result.current.hasNextPage).toBe(true);
    await result.current.fetchNextPage();

    await waitFor(() => expect(result.current.requests).toEqual([
      sampleRequests[0],
      secondRequest.expected,
    ]));
    expect(result.current.hasNextPage).toBe(false);
    expect(String(fetchSpy.mock.calls[1][0])).toContain("cursor=next");
  });

  it("realtime operational invalidation restarts an active list from the first page", async () => {
    const secondRequest = shippingFixture("req-2", "PREPARED", "pf-2");
    const fetchSpy = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      return Promise.resolve(makeResponse(url.includes("cursor=next")
        ? { requests: [secondRequest.raw], next_cursor: null, has_more: false }
        : { requests: sampleResponses, next_cursor: "next", has_more: true }));
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient();
    const { result } = renderHook(() => useShippingRequestPagesQuery(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.requests).toEqual(sampleRequests));
    await result.current.fetchNextPage();
    await waitFor(() => expect(result.current.requests).toEqual([
      ...sampleRequests,
      secondRequest.expected,
    ]));

    fetchSpy.mockClear();
    await invalidateOperationalQueries(client);

    expect(fetchSpy).toHaveBeenCalled();
    expect(String(fetchSpy.mock.calls[0][0])).not.toContain("cursor=");
  });
});
