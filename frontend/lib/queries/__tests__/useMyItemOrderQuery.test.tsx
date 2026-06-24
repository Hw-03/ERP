/**
 * useMyItemOrderQuery / usePutMyItemOrderMutation / useResetMyItemOrderMutation 단위 테스트
 *
 * buildEmployeeOrderRank 순수 함수 + 훅 동작 검증.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useMyItemOrderQuery,
  usePutMyItemOrderMutation,
  useResetMyItemOrderMutation,
} from "../useMyItemOrderQuery";
import { queryKeys } from "../keys";
import { buildEmployeeOrderRank } from "@/app/mes/_components/_warehouse_v2/itemPickerShared";

// ─── 헬퍼 ──────────────────────────────────────────────────────────────────

function makeResponse(body: unknown, ok = true, status?: number): Response {
  const s = status ?? (ok ? 200 : 500);
  return {
    ok,
    status: s,
    statusText: ok ? "OK" : "Error",
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

// ─── buildEmployeeOrderRank 단위 ───────────────────────────────────────────

describe("buildEmployeeOrderRank", () => {
  it("entries → item_id 키, display_order 값 맵 반환", () => {
    const entries = [
      { item_id: "A", display_order: 0 },
      { item_id: "B", display_order: 1 },
    ];
    const map = buildEmployeeOrderRank(entries);
    expect(map.get("A")).toBe(0);
    expect(map.get("B")).toBe(1);
  });

  it("entries 없으면 빈 Map 반환 (기존 부서순 폴백)", () => {
    expect(buildEmployeeOrderRank(undefined).size).toBe(0);
    expect(buildEmployeeOrderRank([]).size).toBe(0);
  });

  it("내 순서 있는 품목은 앞, 없는(신규) 품목은 Infinity로 뒤에 정렬됨", () => {
    const map = buildEmployeeOrderRank([
      { item_id: "X", display_order: 5 },
    ]);
    const rankX = map.get("X") ?? Number.POSITIVE_INFINITY;
    const rankNew = map.get("NEW") ?? Number.POSITIVE_INFINITY;
    expect(rankX).toBeLessThan(rankNew);
    expect(rankNew).toBe(Number.POSITIVE_INFINITY);
  });
});

// ─── useMyItemOrderQuery ───────────────────────────────────────────────────

describe("useMyItemOrderQuery", () => {
  it("employeeId 있으면 my-order fetch", async () => {
    const data = [{ item_id: "i1", display_order: 0 }];
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(data)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient();
    const { result } = renderHook(() => useMyItemOrderQuery("emp1"), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(data);
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/items/my-order");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("employee_id=emp1");
  });

  it("employeeId 없으면 fetch 하지 않음(비활성)", () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse([])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const client = makeClient();
    renderHook(() => useMyItemOrderQuery(null), { wrapper: makeWrapper(client) });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ─── usePutMyItemOrderMutation ─────────────────────────────────────────────

describe("usePutMyItemOrderMutation", () => {
  it("PUT 호출 후 my-order 쿼리 invalidate", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({ ok: true })));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => usePutMyItemOrderMutation(), {
      wrapper: makeWrapper(client),
    });

    await act(() =>
      result.current.mutateAsync({
        employee_id: "emp1",
        items: [{ item_id: "i1", display_order: 0 }],
      }),
    );

    const url = String(fetchSpy.mock.calls[0][0]);
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(url).toContain("/api/items/my-order");
    expect(init.method).toBe("PUT");
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.myItemOrder.byEmployee("emp1"),
      }),
    );
  });
});

// ─── useResetMyItemOrderMutation ──────────────────────────────────────────

describe("useResetMyItemOrderMutation", () => {
  it("DELETE 호출 후 my-order 쿼리 invalidate", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({ ok: true })));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useResetMyItemOrderMutation(), {
      wrapper: makeWrapper(client),
    });

    await act(() => result.current.mutateAsync("emp1"));

    const url = String(fetchSpy.mock.calls[0][0]);
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(url).toContain("/api/items/my-order");
    expect(url).toContain("employee_id=emp1");
    expect(init.method).toBe("DELETE");
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.myItemOrder.byEmployee("emp1"),
      }),
    );
  });
});
