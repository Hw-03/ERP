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
});
