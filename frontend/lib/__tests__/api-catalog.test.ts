/**
 * api-catalog.test.ts — MSW + React Query hook 통합 테스트 (W4-C)
 *
 * 기존: fetch URL substring만 검증 (wiring 확인).
 * 신규: useModelsQuery / mutation hook의 실제 동작 검증.
 *   - 요청 body 매칭
 *   - 응답 데이터 shape 검증
 *   - 에러 모드(403/404) 분기 검증
 *   - mutation 성공 후 query invalidation 확인
 */

import React from "react";
import { describe, it, expect } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "./msw/server";
import {
  useModelsQuery,
  useCreateModelMutation,
  useUpdateModelMutation,
  useDeleteModelMutation,
  useReorderModelsMutation,
} from "@/lib/queries/useModelsQuery";

/** 각 테스트마다 새로운 QueryClient로 격리 */
function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  }
  return { client, Wrapper };
}

// ---------------------------------------------------------------------------
// useModelsQuery — GET /api/models
// ---------------------------------------------------------------------------

describe("useModelsQuery (MSW)", () => {
  it("정상 응답: data shape 검증 (length + model_name)", async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useModelsQuery(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0].model_name).toBe("DX3000");
    expect(result.current.data?.[1].symbol).toBe("B");
  });

  it("404 응답 시 isError === true", async () => {
    server.use(
      http.get("*/api/models", () =>
        HttpResponse.json({ detail: "Not found" }, { status: 404 }),
      ),
    );
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useModelsQuery(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// ---------------------------------------------------------------------------
// useCreateModelMutation — POST /api/models
// ---------------------------------------------------------------------------

describe("useCreateModelMutation (MSW)", () => {
  it("요청 body model_name 매칭 + 응답 schema 검증 (slot·symbol·display_order)", async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useCreateModelMutation(), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({ model_name: "NEWMODEL" });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = result.current.data as { slot: number; model_name: string; display_order: number };
    expect(data.slot).toBe(3);
    expect(data.model_name).toBe("NEWMODEL");
    expect(typeof data.display_order).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// useUpdateModelMutation — PUT /api/models/:slot
// ---------------------------------------------------------------------------

describe("useUpdateModelMutation (MSW)", () => {
  it("PIN 통과(0000) → 성공 + 응답 slot 일치", async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useUpdateModelMutation(), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({ slot: 1, payload: { model_name: "DX4000", pin: "0000" } });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = result.current.data as { slot: number; model_name: string };
    expect(data.slot).toBe(1);
    expect(data.model_name).toBe("DX4000");
  });

  it("PIN 불일치(1234) → 403 → isError === true", async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useUpdateModelMutation(), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({ slot: 1, payload: { model_name: "X", pin: "1234" } });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// ---------------------------------------------------------------------------
// useDeleteModelMutation — DELETE /api/models/:slot
// ---------------------------------------------------------------------------

describe("useDeleteModelMutation (MSW)", () => {
  it("body PIN(0000) → 204 → isSuccess === true", async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useDeleteModelMutation(), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({ slot: 1, pin: "0000" });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("PIN 누락/오류 → 400 → isError === true", async () => {
    server.use(
      http.delete("*/api/models/:slot", () =>
        HttpResponse.json({ detail: "PIN 누락" }, { status: 400 }),
      ),
    );
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useDeleteModelMutation(), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({ slot: 1, pin: "wrong" });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// ---------------------------------------------------------------------------
// useReorderModelsMutation — PATCH /api/models/reorder
// ---------------------------------------------------------------------------

describe("useReorderModelsMutation (MSW)", () => {
  it("정상 PIN → { ok: true } 응답", async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useReorderModelsMutation(), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({
        items: [
          { slot: 1, display_order: 1 },
          { slot: 2, display_order: 0 },
        ],
        pin: "0000",
      });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect((result.current.data as { ok: boolean }).ok).toBe(true);
  });

  it("PIN 불일치 → 403 → isError === true", async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useReorderModelsMutation(), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({
        items: [{ slot: 1, display_order: 0 }],
        pin: "9999",
      });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// ---------------------------------------------------------------------------
// mutation 성공 후 useModelsQuery 자동 invalidate
// ---------------------------------------------------------------------------

describe("mutation → query invalidation (MSW)", () => {
  it("createModel 성공 후 useModelsQuery가 refetch됨", async () => {
    // 두 번째 GET 응답은 3개 항목 반환
    let callCount = 0;
    server.use(
      http.get("*/api/models", () => {
        callCount += 1;
        if (callCount >= 2) {
          return HttpResponse.json([
            { slot: 1, symbol: "A", model_name: "DX3000", is_reserved: false, display_order: 0 },
            { slot: 2, symbol: "B", model_name: "COCOON", is_reserved: false, display_order: 1 },
            { slot: 3, symbol: "C", model_name: "NEWMODEL", is_reserved: false, display_order: 2 },
          ]);
        }
        return HttpResponse.json([
          { slot: 1, symbol: "A", model_name: "DX3000", is_reserved: false, display_order: 0 },
          { slot: 2, symbol: "B", model_name: "COCOON", is_reserved: false, display_order: 1 },
        ]);
      }),
    );

    const { Wrapper } = makeWrapper();

    const queryResult = renderHook(() => useModelsQuery(), { wrapper: Wrapper });
    await waitFor(() => expect(queryResult.result.current.isSuccess).toBe(true));
    expect(queryResult.result.current.data).toHaveLength(2);

    const mutResult = renderHook(() => useCreateModelMutation(), { wrapper: Wrapper });
    await act(async () => {
      mutResult.result.current.mutate({ model_name: "NEWMODEL" });
    });
    await waitFor(() => expect(mutResult.result.current.isSuccess).toBe(true));

    // invalidation 후 query가 refetch → 3개 항목
    await waitFor(() => expect(queryResult.result.current.data).toHaveLength(3), {
      timeout: 3000,
    });
  });
});
