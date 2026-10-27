import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useHistoryGroups } from "../useHistoryGroups";
const searchState = vi.hoisted(() => ({ version: 0, retry: vi.fn() }));
vi.mock("@/lib/queries/useItemSearch", () => ({ useItemSearch: () => ({ config: { version: searchState.version }, retry: searchState.retry }) }));

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
    workGroups: [],
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
  searchState.version = 0;
  searchState.retry.mockReset();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("useHistoryGroups", () => {
  it.each(["unmount", "filter"])("keeps a shared first-page read alive after another consumer's %s", async (change) => {
    const sharedRequest = deferred<Response>();
    let sharedSignal: AbortSignal | undefined;
    const page = { groups: [makeGroup(1)], next_cursor: null, has_more: false };
    const changedPage = { groups: [makeGroup(2)], next_cursor: null, has_more: false };
    const fetchSpy = vi.fn()
      .mockImplementationOnce((_input: RequestInfo | URL, init?: RequestInit) => {
        sharedSignal = init?.signal ?? undefined;
        return sharedRequest.promise;
      })
      .mockResolvedValue(makeResponse(changedPage));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = makeWrapper(client);
    const first = renderHook(({ department }) => useHistoryGroups({ ...baseArgs, department }), {
      initialProps: { department: "" }, wrapper,
    });
    const second = renderHook(() => useHistoryGroups(baseArgs), { wrapper });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    if (change === "unmount") first.unmount();
    else first.rerender({ department: "assembly" });
    expect(sharedSignal?.aborted).toBe(false);
    await act(async () => sharedRequest.resolve(makeResponse(page)));
    await waitFor(() => expect(second.result.current.groups).toEqual(page.groups));
    expect(second.result.current.error).toBeNull();
    expect(second.result.current.loading).toBe(false);
    if (change === "filter") {
      await waitFor(() => expect(first.result.current.groups).toEqual(changedPage.groups));
    }
    expect(fetchSpy).toHaveBeenCalledTimes(change === "unmount" ? 1 : 2);
  });

  it.each(["unmount", "filter"])("keeps a shared load-more read alive after another consumer's %s", async (change) => {
    const sharedMore = deferred<Response>();
    let moreSignal: AbortSignal | undefined;
    const firstPage = { groups: [makeGroup(0)], next_cursor: "shared-tail", has_more: true };
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(makeResponse(firstPage))
      .mockImplementationOnce((_input: RequestInfo | URL, init?: RequestInit) => {
        moreSignal = init?.signal ?? undefined;
        return sharedMore.promise;
      })
      .mockResolvedValue(makeResponse({ groups: [makeGroup(2)], next_cursor: null, has_more: false }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = makeWrapper(client);
    const first = renderHook(({ department }) => useHistoryGroups({ ...baseArgs, department }), {
      initialProps: { department: "" }, wrapper,
    });
    const second = renderHook(() => useHistoryGroups(baseArgs), { wrapper });
    await waitFor(() => {
      expect(first.result.current.loading).toBe(false);
      expect(second.result.current.loading).toBe(false);
    });
    let firstMore!: Promise<void>;
    let secondMore!: Promise<void>;
    act(() => {
      firstMore = first.result.current.loadMore();
      secondMore = second.result.current.loadMore();
    });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));

    if (change === "unmount") first.unmount();
    else first.rerender({ department: "assembly" });
    expect(moreSignal?.aborted).toBe(false);
    await act(async () => {
      sharedMore.resolve(makeResponse({ groups: [makeGroup(1)], next_cursor: null, has_more: false }));
      await Promise.all([firstMore, secondMore]);
    });
    expect(second.result.current.groups).toEqual([makeGroup(0), makeGroup(1)]);
    expect(second.result.current.loadMoreError).toBeNull();
    expect(second.result.current.canLoadMore).toBe(false);
    if (change === "filter") {
      await waitFor(() => expect(first.result.current.groups).toEqual([makeGroup(2)]));
    }
  });

  it.each(["manual", "revision", "both"])("waits for another consumer's read before a %s refresh", async (refresh) => {
    const sharedRequest = deferred<Response>();
    const freshRequest = deferred<Response>();
    let sharedSignal: AbortSignal | undefined;
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(makeResponse({ groups: [makeGroup(0)], next_cursor: null, has_more: false }))
      .mockImplementationOnce((_input: RequestInfo | URL, init?: RequestInit) => {
        sharedSignal = init?.signal ?? undefined;
        return sharedRequest.promise;
      })
      .mockReturnValueOnce(freshRequest.promise);
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = makeWrapper(client);
    const first = renderHook(({ realtimeRevision }) => useHistoryGroups({ ...baseArgs, realtimeRevision }), {
      initialProps: { realtimeRevision: 1 }, wrapper,
    });
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    await client.invalidateQueries({ refetchType: "none" });
    const second = renderHook(() => useHistoryGroups({ ...baseArgs, realtimeRevision: 1 }), { wrapper });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));

    if (refresh === "revision") first.rerender({ realtimeRevision: 2 });
    else act(() => {
      first.result.current.refreshLoaded();
      if (refresh === "both") second.result.current.refreshLoaded();
    });
    await act(async () => {});
    expect(sharedSignal?.aborted).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    await act(async () => sharedRequest.resolve(makeResponse({ groups: [makeGroup(1)], next_cursor: null, has_more: false })));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(3));
    if (refresh !== "both") {
      await waitFor(() => expect(second.result.current.groups).toEqual([makeGroup(1)]));
      expect(second.result.current.refreshError).toBeNull();
    }
    await act(async () => freshRequest.resolve(makeResponse({ groups: [makeGroup(2)], next_cursor: null, has_more: false })));
    await waitFor(() => expect(first.result.current.groups).toEqual([makeGroup(2)]));
    if (refresh === "both") {
      await waitFor(() => expect(second.result.current.groups).toEqual([makeGroup(2)]));
    }
    expect(first.result.current.refreshError).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it.each([true, false])("performs the requested refresh after a shared read fails (fresh success: %s)", async (freshSuccess) => {
    const failedRequest = deferred<Response>();
    const fetchSpy = vi.fn()
      .mockReturnValueOnce(failedRequest.promise)
      .mockResolvedValueOnce(makeResponse(freshSuccess
        ? { groups: [makeGroup(2)], next_cursor: null, has_more: false }
        : { detail: "fresh read failed" }, freshSuccess));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = makeWrapper(client);
    const first = renderHook(() => useHistoryGroups(baseArgs), { wrapper });
    const second = renderHook(() => useHistoryGroups(baseArgs), { wrapper });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    act(() => first.result.current.refreshLoaded());
    await act(async () => {});
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await act(async () => failedRequest.resolve(makeResponse({ detail: "old read failed" }, false)));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    expect(second.result.current.error).toContain("old read failed");
    if (freshSuccess) {
      expect(first.result.current.groups).toEqual([makeGroup(2)]);
      expect(first.result.current.error).toBeNull();
    } else expect(first.result.current.error).toContain("fresh read failed");
  });

  it.each(["unmount", "filter"])("abandons a waiting refresh after its consumer's %s", async (change) => {
    const sharedRequest = deferred<Response>();
    const fetchSpy = vi.fn()
      .mockReturnValueOnce(sharedRequest.promise)
      .mockResolvedValue(makeResponse({ groups: [makeGroup(2)], next_cursor: null, has_more: false }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = makeWrapper(client);
    const first = renderHook(({ department }) => useHistoryGroups({ ...baseArgs, department }), {
      initialProps: { department: "" }, wrapper,
    });
    const second = renderHook(() => useHistoryGroups(baseArgs), { wrapper });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    act(() => first.result.current.refreshLoaded());
    await act(async () => {});
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    if (change === "unmount") first.unmount();
    else first.rerender({ department: "assembly" });

    await act(async () => sharedRequest.resolve(makeResponse({ groups: [makeGroup(1)], next_cursor: "unused-tail", has_more: true })));
    await waitFor(() => expect(second.result.current.groups).toEqual([makeGroup(1)]));
    if (change === "filter") {
      await waitFor(() => expect(first.result.current.groups).toEqual([makeGroup(2)]));
    }
    expect(fetchSpy).toHaveBeenCalledTimes(change === "unmount" ? 1 : 2);
    expect(second.result.current.error).toBeNull();
  });

  it("caches a completed shared request even after all consumers unmount", async () => {
    const sharedRequest = deferred<Response>();
    let sharedSignal: AbortSignal | undefined;
    const fetchSpy = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      sharedSignal = init?.signal ?? undefined;
      return sharedRequest.promise;
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 } } });
    const wrapper = makeWrapper(client);
    const first = renderHook(() => useHistoryGroups(baseArgs), { wrapper });
    const second = renderHook(() => useHistoryGroups(baseArgs), { wrapper });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    first.unmount();
    second.unmount();
    expect(sharedSignal?.aborted).toBe(false);
    const page = { groups: [makeGroup(3)], next_cursor: null, has_more: false };
    await act(async () => sharedRequest.resolve(makeResponse(page)));
    await waitFor(() => expect(client.getQueryCache().getAll()[0].state.status).toBe("success"));

    const remounted = renderHook(() => useHistoryGroups(baseArgs), { wrapper, reactStrictMode: true });
    expect(remounted.result.current.groups).toEqual(page.groups);
    expect(remounted.result.current.loading).toBe(false);
    await act(async () => {});
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("restores the current search-version cache immediately on remount", async () => {
    searchState.version = 4;
    const page = { groups: [makeGroup(4)], next_cursor: null, has_more: false };
    const fetchSpy = vi.fn().mockResolvedValue(makeResponse(page));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 } } });
    const wrapper = makeWrapper(client);
    const first = renderHook(() => useHistoryGroups(baseArgs), { wrapper });
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    first.unmount();
    const second = renderHook(() => useHistoryGroups(baseArgs), { wrapper });
    expect(second.result.current.loading).toBe(false);
    expect(second.result.current.groups).toEqual(page.groups);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await act(async () => {});
  });

  it("restarts a stale background-refresh cursor from page one with the same filters", async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(makeResponse({ groups: [makeGroup(0)], next_cursor: "old-tail", has_more: true }))
      .mockResolvedValueOnce(makeResponse({ groups: [makeGroup(1)], next_cursor: null, has_more: false }))
      .mockResolvedValueOnce(makeResponse({ groups: [makeGroup(10)], next_cursor: "stale-tail", has_more: true }))
      .mockResolvedValueOnce({ ...makeResponse({ detail: { code: "SEARCH_CONFIG_STALE", message: "설정 변경" } }, false), status: 409 })
      .mockResolvedValueOnce(makeResponse({ groups: [makeGroup(20)], next_cursor: null, has_more: false }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 } } });
    const { result } = renderHook(() => useHistoryGroups({ ...baseArgs, debouncedSearch: "전극", department: "조립" }), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => result.current.loadMore());
    act(() => result.current.refreshLoaded());
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(5));
    expect(String(fetchSpy.mock.calls[4][0])).not.toContain("cursor=");
    expect(String(fetchSpy.mock.calls[4][0])).toContain("department=%EC%A1%B0%EB%A6%BD");
    expect(searchState.retry).toHaveBeenCalledOnce();
    await waitFor(() => expect(result.current.groups).toEqual([makeGroup(20)]));
    expect(result.current.refreshError).toBeNull();
  });

  it("invalidates the cached first page before restarting a rejected load-more cursor", async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(makeResponse({ groups: [makeGroup(0)], next_cursor: "stale-tail", has_more: true }))
      .mockResolvedValueOnce({ ...makeResponse({ detail: { code: "SEARCH_CONFIG_STALE", message: "설정 변경" } }, false), status: 409 })
      .mockResolvedValueOnce(makeResponse({ groups: [makeGroup(20)], next_cursor: null, has_more: false }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 } } });
    const { result } = renderHook(() => useHistoryGroups({ ...baseArgs, debouncedSearch: "전극" }), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => result.current.loadMore());
    await waitFor(() => expect(result.current.groups).toEqual([makeGroup(20)]));
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(String(fetchSpy.mock.calls[2][0])).not.toContain("cursor=");
    expect(searchState.retry).toHaveBeenCalledOnce();
    expect(result.current.loadMoreError).toBeNull();
  });

  it("isolates employee pages and ignores late load-more results after the mine filter changes", async () => {
    const oldMore = deferred<Response>();
    const mine = deferred<Response>();
    const firstPage = { groups: [makeGroup(0)], next_cursor: "all-next", has_more: true };
    const minePage = { groups: [makeGroup(2)], next_cursor: null, has_more: false };
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(makeResponse(firstPage))
      .mockReturnValueOnce(oldMore.promise)
      .mockReturnValueOnce(mine.promise);
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, rerender } = renderHook(
      ({ requesterEmployeeId }: { requesterEmployeeId?: string }) => useHistoryGroups({ ...baseArgs, requesterEmployeeId }),
      { initialProps: { requesterEmployeeId: undefined }, wrapper: makeWrapper(client) },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    let loadingMore!: Promise<void>;
    act(() => { loadingMore = result.current.loadMore(); });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    rerender({ requesterEmployeeId: "employee-a" });
    expect(result.current.groups).toEqual([]);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(3));
    expect(String(fetchSpy.mock.calls[2][0])).toContain("requester_employee_id=employee-a");
    expect(String(fetchSpy.mock.calls[2][0])).not.toContain("cursor=");
    await act(async () => mine.resolve(makeResponse(minePage)));
    await waitFor(() => expect(result.current.groups).toEqual(minePage.groups));
    await act(async () => {
      oldMore.resolve(makeResponse({ groups: [makeGroup(1)], next_cursor: null, has_more: false }));
      await loadingMore;
    });
    expect(result.current.groups).toEqual(minePage.groups);
    expect(result.current.loadingMore).toBe(false);
  });

  it("separates employees' cached pages and late first-page responses", async () => {
    const employeeA = deferred<Response>();
    const employeeB = deferred<Response>();
    const fetchSpy = vi.fn().mockReturnValueOnce(employeeA.promise).mockReturnValueOnce(employeeB.promise);
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, rerender } = renderHook(
      ({ requesterEmployeeId }) => useHistoryGroups({ ...baseArgs, requesterEmployeeId }),
      { initialProps: { requesterEmployeeId: "employee-a" }, wrapper: makeWrapper(client) },
    );
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    rerender({ requesterEmployeeId: "employee-b" });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    await act(async () => employeeB.resolve(makeResponse({ groups: [makeGroup(2)], next_cursor: null, has_more: false })));
    await waitFor(() => expect(result.current.groups[0]?.key).toBe("solo:2"));
    await act(async () => employeeA.resolve(makeResponse({ groups: [makeGroup(1)], next_cursor: null, has_more: false })));
    expect(result.current.groups[0]?.key).toBe("solo:2");
    expect(client.getQueryCache().getAll().filter((query) => query.queryKey[1] === "displayGroups")).toHaveLength(2);
  });

  it.each([{ groups: [] }, { groups: [makeGroup(0)] }])("keeps cached data on a failed stale remount", async ({ groups }) => {
    globalThis.fetch = vi.fn().mockResolvedValue(makeResponse({ groups, next_cursor: null, has_more: false })) as unknown as typeof fetch;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = makeWrapper(client);
    const first = renderHook(() => useHistoryGroups(baseArgs), { wrapper });
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    first.unmount();
    await client.invalidateQueries();
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("refresh offline")) as unknown as typeof fetch;
    const next = renderHook(() => useHistoryGroups(baseArgs), { wrapper, reactStrictMode: true });
    expect(next.result.current.loading).toBe(false);
    expect(next.result.current.groups).toEqual(groups);
    await waitFor(() => expect(next.result.current.refreshError).toContain("API 연결에 실패했습니다"));
    expect(next.result.current.error).toBeNull();
  });
  it("uses the shared selected-month range in the desktop group request", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(makeResponse({ groups: [], next_cursor: null, has_more: false }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(
      () => useHistoryGroups({ ...baseArgs, selectedMonth: { year: 2026, month: 7 } }),
      { wrapper: makeWrapper(client) },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(String(fetchSpy.mock.calls[0][0])).toContain("date_from=2026-08-01");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("date_to=2026-08-31");
  });

  it("restores fresh groups immediately without another request after remount", async () => {
    const page = { groups: [makeGroup(0)], next_cursor: null, has_more: false };
    const fetchSpy = vi.fn().mockResolvedValue(makeResponse(page));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000, gcTime: 30 * 60_000 } },
    });
    const wrapper = makeWrapper(client);

    const firstMount = renderHook(() => useHistoryGroups(baseArgs), { wrapper });
    await waitFor(() => expect(firstMount.result.current.loading).toBe(false));
    expect(firstMount.result.current.groups).toEqual(page.groups);
    firstMount.unmount();

    const secondMount = renderHook(() => useHistoryGroups(baseArgs), { wrapper });

    expect(secondMount.result.current.loading).toBe(false);
    expect(secondMount.result.current.groups).toEqual(page.groups);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await act(async () => {});
  });

  it("coalesces revisions during a slow same-key read and refreshes once after it completes", async () => {
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
      ({ realtimeRevision }) => useHistoryGroups({ ...baseArgs, realtimeRevision }),
      { initialProps: { realtimeRevision: 1 }, wrapper: makeWrapper(client) },
    );
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    rerender({ realtimeRevision: 2 });
    rerender({ realtimeRevision: 3 });
    rerender({ realtimeRevision: 4 });

    await act(async () => {});
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(staleSignal?.aborted).toBe(false);
    await act(async () => staleRequest.resolve(makeResponse(firstPage)));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(result.current.groups).toEqual(firstPage.groups);
    await act(async () => freshRequest.resolve(makeResponse(refreshedPage)));
    await waitFor(() => expect(result.current.groups).toEqual(refreshedPage.groups));
    rerender({ realtimeRevision: 4 });
    await act(async () => {});
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.current.groups).toEqual(refreshedPage.groups);
  });

  it("finishes the loaded cursor depth before catching up with the newest pending revision", async () => {
    const slowTail = deferred<Response>();
    const newestTail = deferred<Response>();
    let slowSignal: AbortSignal | undefined;
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(makeResponse({ groups: [makeGroup(0)], next_cursor: "initial-tail", has_more: true }))
      .mockResolvedValueOnce(makeResponse({ groups: [makeGroup(1)], next_cursor: null, has_more: false }))
      .mockResolvedValueOnce(makeResponse({ groups: [makeGroup(10)], next_cursor: "slow-tail", has_more: true }))
      .mockImplementationOnce((_input: RequestInfo | URL, init?: RequestInit) => {
        slowSignal = init?.signal ?? undefined;
        return slowTail.promise;
      })
      .mockResolvedValueOnce(makeResponse({ groups: [makeGroup(20)], next_cursor: "newest-tail", has_more: true }))
      .mockReturnValueOnce(newestTail.promise);
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { result, rerender } = renderHook(
      ({ realtimeRevision }) => useHistoryGroups({ ...baseArgs, realtimeRevision }),
      { initialProps: { realtimeRevision: 1 }, wrapper: makeWrapper(client) },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => result.current.loadMore());
    rerender({ realtimeRevision: 2 });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(4));
    rerender({ realtimeRevision: 3 });
    rerender({ realtimeRevision: 4 });
    await act(async () => {});
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(slowSignal?.aborted).toBe(false);
    expect(result.current.groups).toEqual([makeGroup(0), makeGroup(1)]);
    await act(async () => slowTail.resolve(makeResponse({ groups: [makeGroup(1)], next_cursor: null, has_more: false })));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(6));
    expect(String(fetchSpy.mock.calls[5][0])).toContain("cursor=newest-tail");
    expect(result.current.groups).toEqual([makeGroup(10), makeGroup(1)]);
    await act(async () => newestTail.resolve(makeResponse({ groups: [makeGroup(1)], next_cursor: null, has_more: false })));
    await waitFor(() => expect(result.current.groups).toEqual([makeGroup(20), makeGroup(1)]));
    expect(result.current.refreshError).toBeNull();
  });

  it("drops a queued revision refresh without aborting reads on filter changes or unmount", async () => {
    const oldRequest = deferred<Response>();
    const changedRequest = deferred<Response>();
    const signals: AbortSignal[] = [];
    const fetchSpy = vi.fn()
      .mockImplementationOnce((_input: RequestInfo | URL, init?: RequestInit) => {
        signals.push(init?.signal as AbortSignal);
        return oldRequest.promise;
      })
      .mockImplementationOnce((_input: RequestInfo | URL, init?: RequestInit) => {
        signals.push(init?.signal as AbortSignal);
        return changedRequest.promise;
      });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { rerender, unmount } = renderHook(
      ({ department, realtimeRevision }) => useHistoryGroups({ ...baseArgs, department, realtimeRevision }),
      { initialProps: { department: "", realtimeRevision: 1 }, wrapper: makeWrapper(client) },
    );
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    rerender({ department: "", realtimeRevision: 2 });
    rerender({ department: "조립", realtimeRevision: 2 });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(signals[0].aborted).toBe(false);
    unmount();
    expect(signals[1].aborted).toBe(false);
    await act(async () => {
      oldRequest.resolve(makeResponse({ groups: [makeGroup(1)], next_cursor: "obsolete-tail", has_more: true }));
      changedRequest.resolve(makeResponse({ groups: [makeGroup(2)], next_cursor: null, has_more: false }));
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("follows the pending latest revision after a slow refresh fails", async () => {
    const failedRefresh = deferred<Response>();
    const newestRefresh = deferred<Response>();
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(makeResponse({ groups: [makeGroup(0)], next_cursor: null, has_more: false }))
      .mockReturnValueOnce(failedRefresh.promise)
      .mockReturnValueOnce(newestRefresh.promise);
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { result, rerender } = renderHook(
      ({ realtimeRevision }) => useHistoryGroups({ ...baseArgs, realtimeRevision }),
      { initialProps: { realtimeRevision: 1 }, wrapper: makeWrapper(client) },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    rerender({ realtimeRevision: 2 });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    rerender({ realtimeRevision: 3 });
    await act(async () => failedRefresh.resolve(makeResponse({ detail: "지난 revision 조회 실패" }, false)));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(3));
    expect(result.current.groups).toEqual([makeGroup(0)]);
    expect(result.current.refreshError).toBeNull();
    await act(async () => newestRefresh.resolve(makeResponse({ groups: [makeGroup(3)], next_cursor: null, has_more: false })));
    await waitFor(() => expect(result.current.groups).toEqual([makeGroup(3)]));
  });

  it("still reads a fresh response when queued revisions return to the original revision", async () => {
    const oldRequest = deferred<Response>();
    const fetchSpy = vi.fn()
      .mockReturnValueOnce(oldRequest.promise)
      .mockResolvedValueOnce(makeResponse({ groups: [makeGroup(2)], next_cursor: null, has_more: false }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000, gcTime: 0 } } });
    const { result, rerender } = renderHook(
      ({ realtimeRevision }) => useHistoryGroups({ ...baseArgs, realtimeRevision }),
      { initialProps: { realtimeRevision: 1 }, wrapper: makeWrapper(client) },
    );
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    rerender({ realtimeRevision: 2 });
    rerender({ realtimeRevision: 1 });
    await act(async () => oldRequest.resolve(makeResponse({ groups: [makeGroup(0)], next_cursor: null, has_more: false })));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.groups).toEqual([makeGroup(2)]));
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
      ({ realtimeRevision }) => useHistoryGroups({ ...baseArgs, realtimeRevision }),
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
      ({ realtimeRevision }) => useHistoryGroups({ ...baseArgs, realtimeRevision }),
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
      ({ realtimeRevision }) => useHistoryGroups({ ...baseArgs, realtimeRevision }),
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

  it("명시 새로고침도 기존 두 페이지를 모두 받은 뒤 한 번에 교체한다", async () => {
    const refreshedSecondRequest = deferred<Response>();
    const firstPage = { groups: [makeGroup(0)], next_cursor: "cursor-1", has_more: true };
    const secondPage = { groups: [makeGroup(1)], next_cursor: null, has_more: false };
    const refreshedFirstPage = { groups: [makeGroup(10)], next_cursor: "fresh-cursor-1", has_more: true };
    const refreshedSecondPage = { groups: [makeGroup(11)], next_cursor: null, has_more: false };
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(makeResponse(firstPage))
      .mockResolvedValueOnce(makeResponse(secondPage))
      .mockResolvedValueOnce(makeResponse(refreshedFirstPage))
      .mockReturnValueOnce(refreshedSecondRequest.promise);
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { result } = renderHook(() => useHistoryGroups(baseArgs), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => result.current.loadMore());
    expect(result.current.groups).toEqual([makeGroup(0), makeGroup(1)]);

    const refreshLoaded = (result.current as typeof result.current & { refreshLoaded?: () => void }).refreshLoaded;
    expect(refreshLoaded).toEqual(expect.any(Function));
    if (!refreshLoaded) return;
    act(() => refreshLoaded());
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(4));
    expect(String(fetchSpy.mock.calls[3][0])).toContain("cursor=fresh-cursor-1");
    expect(result.current.groups).toEqual([makeGroup(0), makeGroup(1)]);

    await act(async () => refreshedSecondRequest.resolve(makeResponse(refreshedSecondPage)));
    await waitFor(() => expect(result.current.groups).toEqual([makeGroup(10), makeGroup(11)]));
  });

  it("대표 행 100개를 받고 다음 요청에는 서버 커서를 전달해 완결된 묶음을 덧붙인다", async () => {
    const firstPage = { groups: Array.from({ length: 100 }, (_, index) => makeGroup(index)), next_cursor: "cursor-100", has_more: true };
    const secondPage = { groups: [makeGroup(100)], next_cursor: null, has_more: false };
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(makeResponse(firstPage))
      .mockResolvedValueOnce(makeResponse(secondPage));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { result } = renderHook(() => useHistoryGroups(baseArgs), { wrapper: makeWrapper(client) });

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
    const { result } = renderHook(() => useHistoryGroups(baseArgs), { wrapper: makeWrapper(client) });
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
      ({ department }) => useHistoryGroups({ ...baseArgs, department }),
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
      ({ department, realtimeRevision }) => useHistoryGroups({ ...baseArgs, department, realtimeRevision }),
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
