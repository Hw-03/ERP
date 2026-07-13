/**
 * useHistoryData — React Query 캐싱 이관 테스트.
 *
 * 좌측 사이드바 탭 전환 시 History 탭 재방문마다 첫 페이지를 매번 새로
 * fetch하는 문제(flicker) 회귀 방지. loadMore/canLoadMore/setLogs 시그니처는 유지.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { getCanLoadMore, useHistoryData } from "../useHistoryData";

function makeResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? "OK" : "Error",
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
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

  it("keeps query generations distinct when field values contain the old delimiter", async () => {
    const firstRequest = deferred<Response>();
    const secondRequest = deferred<Response>();
    const secondPage = page1.map((log, index) => ({ ...log, log_id: `S${index}` }));
    const fetchSpy = vi
      .fn()
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient();
    const { result, rerender } = renderHook(
      ({ debouncedSearch, department, model }) => useHistoryData({ ...baseArgs, debouncedSearch, department, model }),
      {
        initialProps: { debouncedSearch: "AX|조립", department: "", model: "M" },
        wrapper: makeWrapper(client),
      },
    );
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    rerender({ debouncedSearch: "AX", department: "조립", model: "|M" });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));

    await act(async () => secondRequest.resolve(makeResponse(secondPage)));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.logs).toEqual(secondPage);

    await act(async () => firstRequest.resolve(makeResponse(page1)));
    expect(result.current.logs).toEqual(secondPage);
  });

  it("blocks loadMore while a cached first page is being revalidated", async () => {
    const revalidation = deferred<Response>();
    const refreshedPage = page1.map((log, index) => ({ ...log, log_id: `R${index}` }));
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(page1))
      .mockReturnValueOnce(revalidation.promise)
      .mockResolvedValue(makeResponse(page2));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient({ gcTime: 5 * 60_000 });
    const first = renderHook(() => useHistoryData(baseArgs), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    first.unmount();
    await client.invalidateQueries({ queryKey: ["transactions"] });

    const second = renderHook(() => useHistoryData(baseArgs), { wrapper: makeWrapper(client) });
    expect(second.result.current.loading).toBe(false);
    expect(second.result.current.logs).toEqual(page1);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));

    await act(async () => second.result.current.loadMore());
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(second.result.current.logs).toEqual(page1);

    await act(async () => revalidation.resolve(makeResponse(refreshedPage)));
    await waitFor(() => expect(second.result.current.logs).toEqual(refreshedPage));

    await act(async () => second.result.current.loadMore());
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(second.result.current.logs).toHaveLength(140);
  });

  it("preserves cached rows and page judgment when retry also fails", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(page1))
      .mockResolvedValue(makeResponse({ detail: "history unavailable" }, false));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient({ gcTime: 5 * 60_000 });
    const first = renderHook(() => useHistoryData(baseArgs), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    first.unmount();

    await client.invalidateQueries({ queryKey: ["transactions"] });

    const second = renderHook(() => useHistoryData(baseArgs), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(second.result.current.error).toContain("history unavailable"));
    expect(second.result.current.logs).toEqual(page1);
    expect(second.result.current.canLoadMore).toBe(true);

    act(() => second.result.current.retry());

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(second.result.current.error).toContain("history unavailable"));
    expect(second.result.current.logs).toEqual(page1);
    expect(second.result.current.canLoadMore).toBe(true);
  });

  it("preserves successfully loaded rows and terminal page state across failed retries", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(page1))
      .mockResolvedValueOnce(makeResponse(page2))
      .mockResolvedValue(makeResponse({ detail: "history unavailable" }, false));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient();
    const { result } = renderHook(() => useHistoryData(baseArgs), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => result.current.loadMore());
    expect(result.current.logs).toHaveLength(140);
    expect(result.current.canLoadMore).toBe(false);

    await client.invalidateQueries({ queryKey: ["transactions"] });
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.error).toContain("history unavailable"));
    expect(result.current.logs).toHaveLength(140);
    expect(result.current.canLoadMore).toBe(false);

    act(() => result.current.retry());
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(result.current.error).toContain("history unavailable"));
    expect(result.current.logs).toHaveLength(140);
    expect(result.current.canLoadMore).toBe(false);
  });

  it("clears prior rows when the query conditions change", async () => {
    let resolveChangedQuery!: (response: Response) => void;
    const changedQuery = new Promise<Response>((resolve) => {
      resolveChangedQuery = resolve;
    });
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(page1))
      .mockReturnValueOnce(changedQuery);
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient();
    const { result, rerender } = renderHook(
      ({ department }) => useHistoryData({ ...baseArgs, department }),
      { initialProps: { department: "" }, wrapper: makeWrapper(client) },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    rerender({ department: "assembly" });

    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(result.current.logs).toEqual([]);
    expect(result.current.canLoadMore).toBe(false);

    await act(async () => resolveChangedQuery(makeResponse(page2)));
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("resets load-more state on a query change and isolates stale generations", async () => {
    const oldMore = deferred<Response>();
    const changedFirst = deferred<Response>();
    const changedMore = deferred<Response>();
    const changedPage = page1.map((log, index) => ({ ...log, log_id: `B${index}` }));
    const changedPage2 = page2.map((log, index) => ({ ...log, log_id: `B${100 + index}` }));
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(page1))
      .mockReturnValueOnce(oldMore.promise)
      .mockReturnValueOnce(changedFirst.promise)
      .mockReturnValueOnce(changedMore.promise);
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient();
    const { result, rerender } = renderHook(
      ({ department }) => useHistoryData({ ...baseArgs, department }),
      { initialProps: { department: "" }, wrapper: makeWrapper(client) },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      void result.current.loadMore();
    });
    await waitFor(() => expect(result.current.loadingMore).toBe(true));

    rerender({ department: "assembly" });
    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(result.current.loadingMore).toBe(false);
    expect(result.current.loadMoreError).toBeNull();
    expect(result.current.logs).toEqual([]);

    await act(async () => changedFirst.resolve(makeResponse(changedPage)));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      void result.current.loadMore();
    });
    await waitFor(() => expect(result.current.loadingMore).toBe(true));

    await act(async () => oldMore.resolve(makeResponse(page2)));
    expect(result.current.loadingMore).toBe(true);
    expect(result.current.logs).toEqual(changedPage);

    await act(async () => changedMore.resolve(makeResponse(changedPage2)));
    await waitFor(() => expect(result.current.loadingMore).toBe(false));
    expect(result.current.logs).toHaveLength(140);
  });

  it("hides and blocks load-more while the first page retry is loading", async () => {
    const retryPage = deferred<Response>();
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(page1))
      .mockReturnValueOnce(retryPage.promise)
      .mockResolvedValue(makeResponse(page2));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient();
    const { result } = renderHook(() => useHistoryData(baseArgs), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await client.invalidateQueries({ queryKey: ["transactions"] });

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(result.current.logs).toEqual(page1);
    expect(result.current.canLoadMore).toBe(false);

    await act(async () => result.current.loadMore());
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.current.logs).toEqual(page1);

    await act(async () => retryPage.resolve(makeResponse(page1)));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.canLoadMore).toBe(true);
  });

  it("does not append twice when loadMore is requested again while already loading", async () => {
    const morePage = deferred<Response>();
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(page1))
      .mockReturnValueOnce(morePage.promise);
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient();
    const { result } = renderHook(() => useHistoryData(baseArgs), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.loadMore();
    });
    await waitFor(() => expect(result.current.loadingMore).toBe(true));
    act(() => {
      second = result.current.loadMore();
    });

    await act(async () => {
      morePage.resolve(makeResponse(page2));
      await Promise.all([first, second]);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.current.logs).toHaveLength(140);
    expect(result.current.loadingMore).toBe(false);
  });

  it("ignores a same-key loadMore from the generation before retry", async () => {
    const sharedMore = deferred<Response>();
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(page1))
      .mockReturnValueOnce(sharedMore.promise)
      .mockResolvedValueOnce(makeResponse(page1));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient();
    const { result } = renderHook(() => useHistoryData(baseArgs), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      void result.current.loadMore();
    });
    await waitFor(() => expect(result.current.loadingMore).toBe(true));

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.loadingMore).toBe(false);

    act(() => {
      void result.current.loadMore();
    });
    await waitFor(() => expect(result.current.loadingMore).toBe(true));

    await act(async () => sharedMore.resolve(makeResponse(page2)));
    await waitFor(() => expect(result.current.loadingMore).toBe(false));
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(result.current.logs).toHaveLength(140);
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

    await act(async () => result.current.loadMore());

    await waitFor(() => expect(result.current.logs.length).toBe(140));
    expect(result.current.canLoadMore).toBe(false); // page2.length(40) < HISTORY_PAGE_SIZE(100)
  });

  it("최초 조회 실패를 빈 결과와 구분하고 retry로 복구한다", async () => {
    let call = 0;
    const fetchSpy = vi.fn(() => {
      call += 1;
      return Promise.resolve(call === 1 ? makeResponse({ detail: "조회 실패" }, false) : makeResponse(page1));
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient();
    const { result } = renderHook(() => useHistoryData(baseArgs), { wrapper: makeWrapper(client) });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.logs).toEqual([]);
    expect(result.current.error).toContain("조회 실패");

    act(() => result.current.retry());

    await waitFor(() => expect(result.current.logs).toEqual(page1));
    expect(result.current.error).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("더보기 실패 시 기존 rows를 보존하고 같은 페이지를 다시 시도한다", async () => {
    let call = 0;
    const fetchSpy = vi.fn(() => {
      call += 1;
      if (call === 1) return Promise.resolve(makeResponse(page1));
      if (call === 2) return Promise.resolve(makeResponse({ detail: "추가 조회 실패" }, false));
      return Promise.resolve(makeResponse(page2));
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient();
    const { result } = renderHook(() => useHistoryData(baseArgs), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => result.current.loadMore());

    expect(result.current.logs).toEqual(page1);
    expect(result.current.loadMoreError).toContain("추가 조회 실패");

    await act(async () => result.current.loadMore());

    expect(result.current.logs).toHaveLength(140);
    expect(result.current.loadMoreError).toBeNull();
    expect(String(fetchSpy.mock.calls[1][0])).toContain("skip=100");
    expect(String(fetchSpy.mock.calls[2][0])).toContain("skip=100");
  });

  it("setLogs로 개별 로그를 in-place 패치할 수 있다", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(page1)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient();
    const { result } = renderHook(() => useHistoryData(baseArgs), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setLogs((prev) => prev.map((l) => (l.log_id === "L0" ? { ...l, cancelled: true } : l)));
    });

    await waitFor(() => expect((result.current.logs.find((l) => l.log_id === "L0") as { cancelled?: boolean })?.cancelled).toBe(true));
  });
});

describe("getCanLoadMore", () => {
  it.each([
    { loadedCount: 100, totalCount: 100, expected: false },
    { loadedCount: 100, totalCount: 101, expected: true },
    { loadedCount: 200, totalCount: 200, expected: false },
    { loadedCount: 200, totalCount: 201, expected: true },
  ])("전체 $totalCount건 중 $loadedCount건 로드 상태를 계산한다", ({ loadedCount, totalCount, expected }) => {
    expect(getCanLoadMore({ loadedCount, totalCount, lastBatchSize: 100 })).toBe(expected);
  });

  it("전체 건수가 없을 때만 마지막 페이지 크기로 fallback한다", () => {
    expect(getCanLoadMore({ loadedCount: 100, totalCount: null, lastBatchSize: 100 })).toBe(true);
    expect(getCanLoadMore({ loadedCount: 140, totalCount: undefined, lastBatchSize: 40 })).toBe(false);
  });
});
