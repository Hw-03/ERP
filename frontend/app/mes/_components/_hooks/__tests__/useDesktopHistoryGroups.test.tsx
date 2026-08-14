import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useDesktopHistoryGroups } from "../useDesktopHistoryGroups";

function makeResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? "OK" : "Error",
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

function makeGroup(index: number) {
  return {
    type: "solo" as const,
    key: `solo:${index}`,
    logs: [{ log_id: `log-${index}`, created_at: "2026-07-15T00:00:00Z" }],
  };
}

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

describe("useDesktopHistoryGroups", () => {
  it("restores fresh groups immediately without another request after remount", async () => {
    const page = { groups: [makeGroup(0)], next_cursor: null, has_more: false };
    const fetchSpy = vi.fn().mockResolvedValue(makeResponse(page));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000, gcTime: 30 * 60_000 } },
    });
    const wrapper = makeWrapper(client);

    const firstMount = renderHook(() => useDesktopHistoryGroups(baseArgs), { wrapper });
    await waitFor(() => expect(firstMount.result.current.loading).toBe(false));
    expect(firstMount.result.current.groups).toEqual(page.groups);
    firstMount.unmount();

    const secondMount = renderHook(() => useDesktopHistoryGroups(baseArgs), { wrapper });

    expect(secondMount.result.current.loading).toBe(false);
    expect(secondMount.result.current.groups).toEqual(page.groups);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("cancels an in-flight same-key group request before a realtime revision refresh", async () => {
    const staleRequest = deferred<Response>();
    const freshRequest = deferred<Response>();
    let staleSignal: AbortSignal | null = null;
    const firstPage = { groups: [makeGroup(0)], next_cursor: null, has_more: false };
    const refreshedPage = { groups: [makeGroup(1)], next_cursor: null, has_more: false };
    const fetchSpy = vi.fn()
      .mockImplementationOnce((_input: RequestInfo | URL, init?: RequestInit) => {
        staleSignal = init?.signal as AbortSignal | null ?? null;
        return staleRequest.promise;
      })
      .mockImplementationOnce(() => freshRequest.promise);
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000, gcTime: 30 * 60_000 } },
    });
    const { result, rerender } = renderHook(
      ({ realtimeRevision }) => useDesktopHistoryGroups({ ...baseArgs, realtimeRevision }),
      { initialProps: { realtimeRevision: 1 }, wrapper: makeWrapper(client) },
    );
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    rerender({ realtimeRevision: 2 });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(staleSignal?.aborted).toBe(true);
    await act(async () => freshRequest.resolve(makeResponse(refreshedPage)));
    await waitFor(() => expect(result.current.groups).toEqual(refreshedPage.groups));

    await act(async () => staleRequest.resolve(makeResponse(firstPage)));
    expect(result.current.groups).toEqual(refreshedPage.groups);
  });

  it("keeps visible groups while a same-query realtime refresh is pending", async () => {
    const refreshRequest = deferred<Response>();
    const initialPage = { groups: [makeGroup(0)], next_cursor: null, has_more: false };
    const refreshedPage = { groups: [makeGroup(1)], next_cursor: null, has_more: false };
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(makeResponse(initialPage))
      .mockReturnValueOnce(refreshRequest.promise);
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { result, rerender } = renderHook(
      ({ realtimeRevision }) => useDesktopHistoryGroups({ ...baseArgs, realtimeRevision }),
      { initialProps: { realtimeRevision: 1 }, wrapper: makeWrapper(client) },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    rerender({ realtimeRevision: 2 });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(result.current.loading).toBe(false);
    expect(result.current.groups).toEqual(initialPage.groups);
    expect(result.current.refreshError).toBeNull();

    await act(async () => refreshRequest.resolve(makeResponse(refreshedPage)));
    await waitFor(() => expect(result.current.groups).toEqual(refreshedPage.groups));
    expect(result.current.loading).toBe(false);
  });

  it("keeps visible groups and retries a failed realtime refresh without showing the skeleton", async () => {
    const retryRequest = deferred<Response>();
    const initialPage = { groups: [makeGroup(0)], next_cursor: null, has_more: false };
    const refreshedPage = { groups: [makeGroup(2)], next_cursor: null, has_more: false };
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(makeResponse(initialPage))
      .mockResolvedValueOnce(makeResponse({ detail: "동기화 실패" }, false))
      .mockReturnValueOnce(retryRequest.promise);
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { result, rerender } = renderHook(
      ({ realtimeRevision }) => useDesktopHistoryGroups({ ...baseArgs, realtimeRevision }),
      { initialProps: { realtimeRevision: 1 }, wrapper: makeWrapper(client) },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    rerender({ realtimeRevision: 2 });

    await waitFor(() => expect(result.current.refreshError).toContain("동기화 실패"));
    expect(result.current.error).toBeNull();
    expect(result.current.groups).toEqual(initialPage.groups);

    act(() => result.current.retryRefresh());
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(3));
    expect(result.current.loading).toBe(false);
    expect(result.current.groups).toEqual(initialPage.groups);
    expect(result.current.refreshError).toBeNull();

    await act(async () => retryRequest.resolve(makeResponse(refreshedPage)));
    await waitFor(() => expect(result.current.groups).toEqual(refreshedPage.groups));
    expect(result.current.refreshError).toBeNull();
  });

  it("revalidates every loaded cursor page on a realtime revision", async () => {
    const firstPage = {
      groups: Array.from({ length: 100 }, (_, index) => makeGroup(index)),
      next_cursor: "cursor-100",
      has_more: true,
    };
    const secondPage = { groups: [makeGroup(100)], next_cursor: null, has_more: false };
    const refreshedFirstPage = {
      groups: Array.from({ length: 100 }, (_, index) => makeGroup(index + 1000)),
      next_cursor: "fresh-cursor-100",
      has_more: true,
    };
    const refreshedSecondPage = {
      groups: Array.from({ length: 100 }, (_, index) => makeGroup(index)),
      next_cursor: "fresh-cursor-200",
      has_more: true,
    };
    const refreshedThirdPage = { groups: [makeGroup(100)], next_cursor: null, has_more: false };
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(makeResponse(firstPage))
      .mockResolvedValueOnce(makeResponse(secondPage))
      .mockResolvedValueOnce(makeResponse(refreshedFirstPage))
      .mockResolvedValueOnce(makeResponse(refreshedSecondPage))
      .mockResolvedValueOnce(makeResponse(refreshedThirdPage));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000, gcTime: 0 } },
    });
    const { result, rerender } = renderHook(
      ({ realtimeRevision }) => useDesktopHistoryGroups({ ...baseArgs, realtimeRevision }),
      { initialProps: { realtimeRevision: 1 }, wrapper: makeWrapper(client) },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => result.current.loadMore());
    expect(result.current.groups).toHaveLength(101);

    rerender({ realtimeRevision: 2 });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(5));
    expect(String(fetchSpy.mock.calls[4][0])).toContain("cursor=fresh-cursor-200");
    await waitFor(() => {
      expect(result.current.groups).toEqual([
        ...refreshedFirstPage.groups,
        ...refreshedSecondPage.groups,
        ...refreshedThirdPage.groups,
      ]);
    });
  });

  it("대표 행 100개를 받고 다음 요청에는 서버 커서를 전달해 완결된 묶음을 덧붙인다", async () => {
    const firstPage = { groups: Array.from({ length: 100 }, (_, index) => makeGroup(index)), next_cursor: "cursor-100", has_more: true };
    const secondPage = { groups: [makeGroup(100)], next_cursor: null, has_more: false };
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(makeResponse(firstPage))
      .mockResolvedValueOnce(makeResponse(secondPage));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { result } = renderHook(() => useDesktopHistoryGroups(baseArgs), { wrapper: makeWrapper(client) });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.groups).toHaveLength(100);
    expect(result.current.canLoadMore).toBe(true);

    await act(async () => result.current.loadMore());

    expect(result.current.groups).toHaveLength(101);
    expect(result.current.canLoadMore).toBe(false);
    expect(String(fetchSpy.mock.calls[1][0])).toContain("cursor=cursor-100");
    expect(String(fetchSpy.mock.calls[1][0])).not.toContain("skip=");
  });

  it("추가 조회 실패 뒤 같은 커서로 재시도하면서 이미 받은 대표 행을 보존한다", async () => {
    const firstPage = { groups: [makeGroup(0)], next_cursor: "retry-cursor", has_more: true };
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(makeResponse(firstPage))
      .mockResolvedValueOnce(makeResponse({ detail: "추가 조회 실패" }, false))
      .mockResolvedValueOnce(makeResponse({ groups: [makeGroup(1)], next_cursor: null, has_more: false }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { result } = renderHook(() => useDesktopHistoryGroups(baseArgs), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => result.current.loadMore());
    expect(result.current.groups).toHaveLength(1);
    expect(result.current.loadMoreError).toContain("추가 조회 실패");

    await act(async () => result.current.loadMore());
    expect(result.current.groups).toHaveLength(2);
    expect(String(fetchSpy.mock.calls[1][0])).toContain("cursor=retry-cursor");
    expect(String(fetchSpy.mock.calls[2][0])).toContain("cursor=retry-cursor");
  });

  it("필터가 바뀐 뒤 늦게 도착한 이전 대표 그룹 응답을 무시한다", async () => {
    const oldRequest = deferred<Response>();
    const changedRequest = deferred<Response>();
    const fetchSpy = vi.fn()
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(changedRequest.promise);
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { result, rerender } = renderHook(
      ({ department }) => useDesktopHistoryGroups({ ...baseArgs, department }),
      { initialProps: { department: "" }, wrapper: makeWrapper(client) },
    );
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    rerender({ department: "조립" });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));

    await act(async () => changedRequest.resolve(makeResponse({ groups: [makeGroup(2)], next_cursor: null, has_more: false })));
    await waitFor(() => expect(result.current.groups).toEqual([makeGroup(2)]));

    await act(async () => oldRequest.resolve(makeResponse({ groups: [makeGroup(1)], next_cursor: null, has_more: false })));
    expect(result.current.groups).toEqual([makeGroup(2)]);
  });

  it("uses foreground loading when a realtime revision follows a failed query change", async () => {
    const revisionRequest = deferred<Response>();
    const initialPage = { groups: [makeGroup(0)], next_cursor: null, has_more: false };
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(makeResponse(initialPage))
      .mockResolvedValueOnce(makeResponse({ detail: "필터 조회 실패" }, false))
      .mockReturnValueOnce(revisionRequest.promise);
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { result, rerender } = renderHook(
      ({ department, realtimeRevision }) => useDesktopHistoryGroups({ ...baseArgs, department, realtimeRevision }),
      { initialProps: { department: "", realtimeRevision: 1 }, wrapper: makeWrapper(client) },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    rerender({ department: "조립", realtimeRevision: 1 });
    await waitFor(() => expect(result.current.error).toContain("필터 조회 실패"));

    rerender({ department: "조립", realtimeRevision: 2 });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(3));
    expect(result.current.loading).toBe(true);
    expect(result.current.refreshError).toBeNull();

    await act(async () => revisionRequest.resolve(makeResponse(initialPage)));
    await waitFor(() => expect(result.current.loading).toBe(false));
  });
});
