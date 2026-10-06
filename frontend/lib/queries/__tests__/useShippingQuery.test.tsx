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
import { useShippingHistoryMonthsQuery, useShippingHistoryPagesQuery, useShippingRequestsQuery } from "../useShippingQuery";
import { queryKeys } from "../keys";

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

const sampleRequests = [
  { request_id: "req-1", status: "PREPARING", base_pf_item_id: "pf-1" },
];

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("useShippingRequestsQuery", () => {
  it("마운트 시 GET /api/shipping/requests 호출 + data 반환", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(sampleRequests)));
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
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(sampleRequests)));
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

describe("paginated shipping history queries", () => {
  it("uses a distinct page cache and passes each cursor to the server", async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(makeResponse({ requests: [{ request_id: "first" }], next_cursor: "cursor-2", has_more: true }))
      .mockResolvedValueOnce(makeResponse({ requests: [{ request_id: "second" }], next_cursor: null, has_more: false }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const client = makeClient({ gcTime: 60_000 });
    client.setQueryData(queryKeys.shipping.history(), [{ request_id: "legacy" }]);

    const { result } = renderHook(() => useShippingHistoryPagesQuery({ status: "PICKED_UP", year: 2026, month: 7, q: "INV" }), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
    expect(result.current.data?.pages[0].requests[0].request_id).toBe("first");
    await result.current.fetchNextPage();
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(String(fetchSpy.mock.calls[0][0])).toContain("status=PICKED_UP");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("q=INV");
    expect(String(fetchSpy.mock.calls[1][0])).toContain("cursor=cursor-2");
    expect(client.getQueryData(queryKeys.shipping.history())).toEqual([{ request_id: "legacy" }]);
  });

  it("loads month counts independently by status", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(makeResponse([{ year: 2026, month: 7, count: 2 }]));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const client = makeClient();
    const { result } = renderHook(() => useShippingHistoryMonthsQuery({ status: "CANCELLED" }), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(result.current.data?.[0].count).toBe(2));
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/shipping/history/months?status=CANCELLED");
  });
});
