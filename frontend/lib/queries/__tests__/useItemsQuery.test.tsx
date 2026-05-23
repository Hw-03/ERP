/**
 * W7-3 — useItemsQuery 단위 테스트.
 *
 * React Query hook 5종을 fetch mock + QueryClientProvider wrapper로 검증.
 *  1) useItemsQuery (+ 쿼리 파라미터 처리)
 *  2) useItemQuery (enabled)
 *  3) useCreateItemMutation
 *  4) useUpdateItemMutation
 *  5) useUpdateBomCompletionMutation
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useCreateItemMutation,
  useItemQuery,
  useItemsQuery,
  useUpdateBomCompletionMutation,
  useUpdateItemMutation,
} from "../useItemsQuery";
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

describe("useItemsQuery", () => {
  it("마운트 시 GET /api/items 호출 + process_type_code 쿼리 전달", async () => {
    const sample = [{ item_id: "1", item_name: "샘플", process_type_code: "PA" }];
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(sample)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient();
    const { result } = renderHook(
      () => useItemsQuery({ process_type_code: "PA", search: "샘" }),
      { wrapper: makeWrapper(client) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(sample);
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/items");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("process_type_code=PA");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("search=%EC%83%98");
  });
});

describe("useItemQuery", () => {
  it("itemId null 이면 enabled=false → fetch 미호출", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(makeResponse({ item_id: "1", item_name: "A" })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient();
    const { result } = renderHook(() => useItemQuery(null), {
      wrapper: makeWrapper(client),
    });

    // enabled=false 일 때 isFetching 이 false 여야 함
    expect(result.current.isFetching).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("itemId 제공되면 GET /api/items/{id}", async () => {
    const sample = { item_id: "I7", item_name: "테스트" };
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(sample)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient();
    const { result } = renderHook(() => useItemQuery("I7"), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(sample);
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/items/I7");
  });
});

describe("useCreateItemMutation", () => {
  it("성공 시 items query invalidate + POST", async () => {
    const created = { item_id: "I10", item_name: "신규" };
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(created)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useCreateItemMutation(), {
      wrapper: makeWrapper(client),
    });

    await result.current.mutateAsync({ item_name: "신규" });

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.items.all }),
    );
  });
});

describe("useUpdateItemMutation", () => {
  it("성공 시 PUT /api/items/{id} + invalidate", async () => {
    const updated = { item_id: "I5", item_name: "수정" };
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(updated)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useUpdateItemMutation(), {
      wrapper: makeWrapper(client),
    });

    await result.current.mutateAsync({
      itemId: "I5",
      payload: { item_name: "수정" },
    });

    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/items/I5");
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("PUT");
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.items.all }),
    );
  });
});

describe("useUpdateBomCompletionMutation", () => {
  it("성공 시 PATCH /api/items/{id}/bom-completion + invalidate", async () => {
    const updated = { item_id: "I5", bom_completed: true };
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(updated)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useUpdateBomCompletionMutation(), {
      wrapper: makeWrapper(client),
    });

    await result.current.mutateAsync({ itemId: "I5", completed: true });

    expect(String(fetchSpy.mock.calls[0][0])).toContain(
      "/api/items/I5/bom-completion",
    );
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ completed: true });
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.items.all }),
    );
  });
});
