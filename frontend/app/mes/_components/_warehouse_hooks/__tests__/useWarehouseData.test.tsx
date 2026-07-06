/**
 * useWarehouseData — React Query 캐싱 이관 테스트.
 *
 * 좌측 사이드바 탭 전환 시 Warehouse 탭 재방문마다 items/employees를 매번
 * 새로 fetch하는 문제(랙) 회귀 방지. 핵심: 같은 QueryClient로 두 번째
 * 마운트(탭 재방문 시뮬레이션) 시 loading이 처음부터 false여야 한다.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useWarehouseData } from "../useWarehouseData";
import { queryKeys } from "@/lib/queries/keys";

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

const sampleItems = [{ item_id: "I1", item_name: "테스트품목1", quantity: 10 }];
const sampleEmployees = [{ employee_id: "E1", name: "홍길동", department: "조립" }];

// 마운트마다 items / employees / models 3개 GET이 나가므로 URL로 분기.
function fetchRouter() {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/employees")) return Promise.resolve(makeResponse(sampleEmployees));
    if (url.includes("/api/models")) return Promise.resolve(makeResponse([]));
    if (url.includes("/api/items")) return Promise.resolve(makeResponse(sampleItems));
    return Promise.resolve(makeResponse([]));
  });
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("useWarehouseData", () => {
  it("마운트 시 items/employees fetch + loading 반영", async () => {
    const fetchSpy = fetchRouter();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const onStatusChange = vi.fn();

    const client = makeClient();
    const { result } = renderHook(
      () => useWarehouseData({ globalSearch: "", onStatusChange }),
      { wrapper: makeWrapper(client) },
    );

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual(sampleItems);
    expect(result.current.employees).toEqual(sampleEmployees);
  });

  it("탭 재마운트 시(같은 QueryClient) 캐시 히트로 loading이 처음부터 false — 재요청 없음", async () => {
    const fetchSpy = fetchRouter();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const onStatusChange = vi.fn();

    const client = makeClient({ gcTime: 5 * 60_000, staleTime: 5 * 60_000 });
    const { result, unmount } = renderHook(
      () => useWarehouseData({ globalSearch: "", onStatusChange }),
      { wrapper: makeWrapper(client) },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    const callCountAfterFirstMount = fetchSpy.mock.calls.length;
    expect(callCountAfterFirstMount).toBeGreaterThan(0);

    unmount();

    const { result: result2 } = renderHook(
      () => useWarehouseData({ globalSearch: "", onStatusChange }),
      { wrapper: makeWrapper(client) },
    );

    expect(result2.current.loading).toBe(false);
    expect(result2.current.items).toEqual(sampleItems);
    expect(result2.current.employees).toEqual(sampleEmployees);
    expect(fetchSpy.mock.calls.length).toBe(callCountAfterFirstMount); // 재요청 없음
  });

  it('"items" 커스텀 이벤트 발생 시 items 쿼리를 invalidate', async () => {
    const fetchSpy = fetchRouter();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const onStatusChange = vi.fn();

    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(
      () => useWarehouseData({ globalSearch: "", onStatusChange }),
      { wrapper: makeWrapper(client) },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    window.dispatchEvent(new Event("items"));

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.items.all }),
    );
  });

  it("setItems 호출 시 React Query 캐시가 즉시 갱신됨", async () => {
    const fetchSpy = fetchRouter();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const onStatusChange = vi.fn();

    const client = makeClient();
    const { result } = renderHook(
      () => useWarehouseData({ globalSearch: "", onStatusChange }),
      { wrapper: makeWrapper(client) },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    const updated = [...sampleItems, { item_id: "I2", item_name: "새품목", quantity: 5 }];
    result.current.setItems(updated);

    await waitFor(() =>
      expect(
        client.getQueryData(queryKeys.items.list({ limit: 2000, search: undefined })),
      ).toEqual(updated),
    );
  });
});
