/**
 * useHistoryData — React Query 캐싱 이관 테스트.
 *
 * 좌측 사이드바 탭 전환 시 History 탭 재방문마다 첫 페이지를 매번 새로
 * fetch하는 문제(flicker) 회귀 방지. loadMore/canLoadMore/setLogs 시그니처는 유지.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useHistoryData } from "../useHistoryData";

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
      queries: { retry: false, gcTime: overrides?.gcTime ?? 0, staleTime: overrides?.staleTime ?? 0 },
    },
  });
}

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const page1 = Array.from({ length: 100 }, (_, i) => ({ log_id: `L${i}`, created_at: "2026-07-01T00:00:00Z" }));
const page2 = Array.from({ length: 40 }, (_, i) => ({ log_id: `L${100 + i}`, created_at: "2026-07-01T00:00:00Z" }));

const baseArgs = {
  operations: "",
  dateFilter: "ALL",
  debouncedSearch: "",
  selectedDateKey: null,
  department: "",
};

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("useHistoryData", () => {
  it("마운트 시 첫 페이지 fetch + loading 반영", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(page1)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient();
    const { result } = renderHook(() => useHistoryData(baseArgs), { wrapper: makeWrapper(client) });

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.logs).toEqual(page1);
    expect(result.current.canLoadMore).toBe(true);
  });

  it("탭 재마운트 시(같은 QueryClient) 첫 페이지가 캐시 히트 — 재요청 없음", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(page1)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient({ gcTime: 5 * 60_000, staleTime: 30_000 });
    const { result, unmount } = renderHook(() => useHistoryData(baseArgs), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const callCountAfterFirstMount = fetchSpy.mock.calls.length;

    unmount();

    const { result: result2 } = renderHook(() => useHistoryData(baseArgs), { wrapper: makeWrapper(client) });
    expect(result2.current.loading).toBe(false);
    expect(result2.current.logs).toEqual(page1);
    expect(fetchSpy.mock.calls.length).toBe(callCountAfterFirstMount);
  });

  it("loadMore 호출 시 다음 페이지를 append", async () => {
    let call = 0;
    const fetchSpy = vi.fn(() => {
      call += 1;
      return Promise.resolve(makeResponse(call === 1 ? page1 : page2));
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient();
    const { result } = renderHook(() => useHistoryData(baseArgs), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.loadMore();

    await waitFor(() => expect(result.current.logs.length).toBe(140));
    expect(result.current.canLoadMore).toBe(false); // page2.length(40) < HISTORY_PAGE_SIZE(100)
  });

  it("setLogs로 개별 로그를 in-place 패치할 수 있다", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(page1)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient();
    const { result } = renderHook(() => useHistoryData(baseArgs), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    result.current.setLogs((prev) => prev.map((l) => (l.log_id === "L0" ? { ...l, cancelled: true } : l)));

    await waitFor(() => expect((result.current.logs.find((l) => l.log_id === "L0") as { cancelled?: boolean })?.cancelled).toBe(true));
  });
});
