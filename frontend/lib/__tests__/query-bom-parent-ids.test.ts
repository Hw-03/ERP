import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "./msw/server";
import { catalogApi } from "@/lib/api/catalog";
import { ApiError } from "@/lib/api-core";
import { queryKeys } from "@/lib/queries/keys";
import { useBomParentIdsQuery } from "@/lib/queries/useBomQuery";

const parentId = "00000000-0000-0000-0000-000000000001";

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  }
  return { client, Wrapper };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("BOM parent IDs", () => {
  it("uses a dedicated key under the existing BOM invalidation root", () => {
    expect(queryKeys.bom.parentIds()).toEqual(["bom", "parentIds"]);
  });

  it("calls only the lightweight endpoint and forwards its abort signal", async () => {
    server.use(http.get("*/api/bom/parent-ids", () => HttpResponse.json([parentId])));
    const allBom = vi.spyOn(catalogApi, "getAllBOM");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const signal = new AbortController().signal;
    expect(await catalogApi.getBOMParentIds(signal)).toEqual([parentId]);
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ signal });
    const { client, Wrapper } = makeWrapper();
    const { result } = renderHook(() => useBomParentIdsQuery(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([parentId]);
    expect(client.getQueryData(queryKeys.bom.parentIds())).toEqual([parentId]);
    expect(allBom).not.toHaveBeenCalled();
  });

  it("retries a transient error once and keeps an empty successful result", async () => {
    const getIds = vi.spyOn(catalogApi, "getBOMParentIds")
      .mockRejectedValueOnce(new ApiError("unavailable", 503)).mockResolvedValueOnce([]);
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useBomParentIdsQuery(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 2_000 });
    expect(result.current.data).toEqual([]);
    expect(getIds).toHaveBeenCalledTimes(2);
    expect(getIds.mock.calls[0]?.[0]).toBeInstanceOf(AbortSignal);
  });

  it.each([{}, [null], [""], ["  "], [{ parent_item_id: parentId }]].map((payload) => ({ payload })))(
    "rejects an invalid ID array without retrying: $payload", async ({ payload }) => {
      const getIds = vi.spyOn(catalogApi, "getBOMParentIds").mockResolvedValue(payload as never);
      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useBomParentIdsQuery(), { wrapper: Wrapper });
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(getIds).toHaveBeenCalledTimes(1);
      expect(result.current.error?.message).toBe("BOM 목록 응답 형식이 올바르지 않습니다.");
    },
  );

  it.each([new ApiError("missing", 404), new SyntaxError("bad JSON"), new DOMException("cancelled", "AbortError")])(
    "does not retry permanent or cancelled failures: %s", async (error) => {
      const getIds = vi.spyOn(catalogApi, "getBOMParentIds").mockRejectedValue(error);
      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useBomParentIdsQuery(), { wrapper: Wrapper });
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(getIds).toHaveBeenCalledTimes(1);
    },
  );

  it("aborts an eight-second request and stops after one retry", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const getIds = vi.spyOn(catalogApi, "getBOMParentIds").mockImplementation((signal) => {
      signals.push(signal!);
      return new Promise((_resolve, reject) => {
        signal!.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")), { once: true });
      });
    });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useBomParentIdsQuery(), { wrapper: Wrapper });
    await act(async () => { await vi.advanceTimersByTimeAsync(8_000); });
    expect(signals[0].aborted).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(8_600); });
    expect(result.current.isError).toBe(true);
    expect(result.current.error?.message).toBe("BOM 목록 조회 시간이 초과되었습니다.");
    expect(getIds).toHaveBeenCalledTimes(2);
  });
});
