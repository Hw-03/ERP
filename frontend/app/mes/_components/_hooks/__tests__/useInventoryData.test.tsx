/**
 * useInventoryData — React Query 캐싱 이관 테스트.
 *
 * 좌측 사이드바 탭 전환 시 flicker(재고 데이터를 불러오는 중입니다... 텍스트 노출) 회귀 방지.
 * 핵심: 같은 QueryClient로 두 번째 마운트(탭 재방문 시뮬레이션) 시 loading이
 * 처음부터 false이고 캐시된 값이 즉시 채워져야 한다 — fetch 재호출 없이.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useInventoryData } from "../useInventoryData";
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

const sampleItems = [
  { item_id: "I1", item_name: "테스트품목1", quantity: 10 },
  { item_id: "I2", item_name: "테스트품목2", quantity: 20 },
];

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("useInventoryData", () => {
  it("마운트 시 GET /api/items 호출 + items/loading 반영", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(sampleItems)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const onStatusChange = vi.fn();

    const client = makeClient();
    const { result } = renderHook(
      () => useInventoryData({ globalSearch: "", onStatusChange }),
      { wrapper: makeWrapper(client) },
    );

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual(sampleItems);
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/items");
  });

  it("탭 재마운트 시(같은 QueryClient) 캐시 히트로 loading이 처음부터 false — flicker 회귀 방지", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(sampleItems)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const onStatusChange = vi.fn();

    // 실제 앱의 전역 QueryClient staleTime(5분)을 흉내 — remount 시 캐시가 살아있어야 한다.
    const client = makeClient({ gcTime: 5 * 60_000, staleTime: 5 * 60_000 });
    const { result, unmount } = renderHook(
      () => useInventoryData({ globalSearch: "", onStatusChange }),
      { wrapper: makeWrapper(client) },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    unmount(); // 다른 탭으로 이동 — DesktopMesShell의 key 변경으로 인한 언마운트를 흉내

    const { result: result2 } = renderHook(
      () => useInventoryData({ globalSearch: "", onStatusChange }),
      { wrapper: makeWrapper(client) }, // 같은 client — QueryClient는 컴포넌트 트리 밖에 존재
    );

    // 재마운트 직후 즉시(대기 없이) loading=false + 캐시된 items 이어야 flicker가 없다.
    expect(result2.current.loading).toBe(false);
    expect(result2.current.items).toEqual(sampleItems);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // 재요청 없음
  });

  it('"items" 커스텀 이벤트 발생 시 items 쿼리를 invalidate', async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(sampleItems)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const onStatusChange = vi.fn();

    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(
      () => useInventoryData({ globalSearch: "", onStatusChange }),
      { wrapper: makeWrapper(client) },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    window.dispatchEvent(new Event("items"));

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.items.all }),
    );
  });

  it("setItems 호출 시 React Query 캐시가 즉시 갱신됨", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(sampleItems)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const onStatusChange = vi.fn();

    const client = makeClient();
    const { result } = renderHook(
      () => useInventoryData({ globalSearch: "", onStatusChange }),
      { wrapper: makeWrapper(client) },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    const updated = [...sampleItems, { item_id: "I3", item_name: "새품목", quantity: 5 }];
    result.current.setItems(updated);

    await waitFor(() =>
      expect(
        client.getQueryData(queryKeys.items.list({ limit: 2000, search: undefined })),
      ).toEqual(updated),
    );
  });
});
