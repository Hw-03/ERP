/**
 * W4-A — useModelsQuery 단위 테스트.
 *
 * React Query hook 5종을 fetch mock + QueryClientProvider wrapper로 검증.
 *  1) useModelsQuery: 마운트 시 catalogApi.getModels 호출 + data 반환
 *  2) useCreateModelMutation: 성공 시 models invalidate
 *  3) useUpdateModelMutation: 성공 시 invalidate
 *  4) useDeleteModelMutation: 성공 시 invalidate
 *  5) useReorderModelsMutation: 성공 시 invalidate
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useCreateModelMutation,
  useDeleteModelMutation,
  useModelsQuery,
  useReorderModelsMutation,
  useUpdateModelMutation,
} from "../useModelsQuery";
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

describe("useModelsQuery", () => {
  it("마운트 시 GET /api/models 호출 + data 반환", async () => {
    const sample = [{ slot: 1, model_name: "M1", symbol: "A", display_order: 0 }];
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(sample)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient();
    const { result } = renderHook(() => useModelsQuery(), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(sample);
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/models");
  });
});

describe("useCreateModelMutation", () => {
  it("성공 시 models query를 invalidate", async () => {
    const created = { slot: 2, model_name: "M2", symbol: "B", display_order: 1 };
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(created)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useCreateModelMutation(), {
      wrapper: makeWrapper(client),
    });

    await result.current.mutateAsync({ model_name: "M2", symbol: "B" });

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.models.all }),
    );
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
  });
});

describe("useUpdateModelMutation", () => {
  it("성공 시 models query를 invalidate + PUT /api/models/{slot}", async () => {
    const updated = { slot: 3, model_name: "M3", symbol: "C", display_order: 2 };
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(updated)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useUpdateModelMutation(), {
      wrapper: makeWrapper(client),
    });

    await result.current.mutateAsync({
      slot: 3,
      payload: { model_name: "M3", symbol: "C", pin: "0000" },
    });

    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/models/3");
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("PUT");
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.models.all }),
    );
  });
});

describe("useDeleteModelMutation", () => {
  it("성공 시 models query를 invalidate + DELETE /api/models/{slot}", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(null)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useDeleteModelMutation(), {
      wrapper: makeWrapper(client),
    });

    await result.current.mutateAsync({ slot: 4, pin: "1234" });

    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/models/4");
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("DELETE");
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.models.all }),
    );
  });
});

describe("useReorderModelsMutation", () => {
  it("성공 시 models query를 invalidate + PATCH /api/models/reorder", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({ ok: true })));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useReorderModelsMutation(), {
      wrapper: makeWrapper(client),
    });

    await result.current.mutateAsync({
      items: [
        { slot: 1, display_order: 0 },
        { slot: 2, display_order: 1 },
      ],
      pin: "1234",
    });

    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/models/reorder");
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("PATCH");
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.models.all }),
    );
  });
});
