/**
 * query-bom.test.ts — MSW + React Query hook 통합 테스트 (W7-5)
 */

import React from "react";
import { describe, it, expect } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "./msw/server";
import {
  useBomListQuery,
  useBomQuery,
  useBomTreeQuery,
  useBomWhereUsedQuery,
  useCreateBomMutation,
  useUpdateBomMutation,
  useDeleteBomMutation,
} from "@/lib/queries/useBomQuery";

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: 0 } },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  }
  return { client, Wrapper };
}

// ---------------------------------------------------------------------------
// useBomQuery — GET /api/bom (전체) / GET /api/bom/:parentId (필터)
// ---------------------------------------------------------------------------

describe("useBomListQuery (MSW)", () => {
  it("전체 BOM 목록 반환 (2개)", async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useBomListQuery(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0].bom_id).toBe("bom-1");
  });

  it("404 응답 시 isError === true", async () => {
    server.use(
      http.get("*/api/bom", () =>
        HttpResponse.json({ detail: "Not found" }, { status: 404 }),
      ),
    );
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useBomListQuery(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useBomQuery (MSW)", () => {
  it("parentId 전달: 특정 parent의 BOM 반환", async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useBomQuery("parent-1"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// useBomTreeQuery — GET /api/bom/:parentId/tree
// ---------------------------------------------------------------------------

describe("useBomTreeQuery (MSW)", () => {
  it("트리 구조 반환: 루트 item_id + children", async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useBomTreeQuery("parent-1"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.item_id).toBe("parent-1");
    expect(result.current.data?.children).toHaveLength(1);
    expect(result.current.data?.children[0].item_id).toBe("child-1");
  });

  it("parentId가 빈 문자열이면 쿼리 비활성화", () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useBomTreeQuery(""), { wrapper: Wrapper });
    expect(result.current.fetchStatus).toBe("idle");
  });
});

// ---------------------------------------------------------------------------
// useBomWhereUsedQuery — GET /api/bom/where-used/:itemId
// ---------------------------------------------------------------------------

describe("useBomWhereUsedQuery (MSW)", () => {
  it("itemId 전달 → 역방향 BOM 목록 반환", async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useBomWhereUsedQuery("child-1"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(Array.isArray(result.current.data)).toBe(true);
    expect((result.current.data as unknown[]).length).toBeGreaterThan(0);
  });

  it("itemId가 빈 문자열이면 쿼리 비활성화", () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useBomWhereUsedQuery(""), { wrapper: Wrapper });
    expect(result.current.fetchStatus).toBe("idle");
  });
});

// ---------------------------------------------------------------------------
// useCreateBomMutation — POST /api/bom
// ---------------------------------------------------------------------------

describe("useCreateBomMutation (MSW)", () => {
  it("생성 성공: bom_id 반환", async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useCreateBomMutation(), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({
        parent_item_id: "parent-1",
        child_item_id: "child-3",
        quantity: 3,
        unit: "EA",
      });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const data = result.current.data as { bom_id: string };
    expect(data.bom_id).toBe("bom-new");
  });
});

// ---------------------------------------------------------------------------
// useUpdateBomMutation — PATCH /api/bom/:bomId
// ---------------------------------------------------------------------------

describe("useUpdateBomMutation (MSW)", () => {
  it("수정 성공: 변경된 quantity 반환", async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useUpdateBomMutation(), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({ bomId: "bom-1", payload: { quantity: 5 } });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const data = result.current.data as { quantity: number };
    expect(data.quantity).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// useDeleteBomMutation — DELETE /api/bom/:bomId
// ---------------------------------------------------------------------------

describe("useDeleteBomMutation (MSW)", () => {
  it("삭제 성공: 204 → isSuccess === true", async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useDeleteBomMutation(), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate("bom-1");
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
