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
import { useShippingRequestsQuery } from "../useShippingQuery";

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
  { request_id: "req-1", status: "REQUESTED", base_pf_item_id: "pf-1" },
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

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
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
