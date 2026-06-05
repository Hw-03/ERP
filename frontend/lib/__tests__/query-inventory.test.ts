/**
 * query-inventory.test.ts — MSW + React Query hook 통합 테스트 (W7-6)
 */

import React from "react";
import { describe, it, expect } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "./msw/server";
import {
  useInventorySummaryQuery,
  useItemLocationsQuery,
  useReceiveInventoryMutation,
  useAdjustInventoryMutation,
  useTransferToProductionMutation,
  useTransferToWarehouseMutation,
  useMarkDefectiveMutation,
} from "@/lib/queries/useInventoryQuery";

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
// useInventorySummaryQuery — GET /api/inventory/summary
// ---------------------------------------------------------------------------

describe("useInventorySummaryQuery (MSW)", () => {
  it("정상 응답: total_items + total_quantity + process_types 검증", async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useInventorySummaryQuery(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.total_items).toBe(5);
    expect(result.current.data?.total_quantity).toBe(200);
    expect(result.current.data?.process_types).toHaveLength(2);
  });

  it("500 응답 시 isError === true", async () => {
    server.use(
      http.get("*/api/inventory/summary", () =>
        HttpResponse.json({ detail: "Internal error" }, { status: 500 }),
      ),
    );
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useInventorySummaryQuery(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// ---------------------------------------------------------------------------
// useItemLocationsQuery — GET /api/inventory/locations/:itemId
// ---------------------------------------------------------------------------

describe("useItemLocationsQuery (MSW)", () => {
  it("itemId 전달 → 위치별 재고 반환", async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useItemLocationsQuery("item-1"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0].department).toBe("조립");
    expect(result.current.data?.[0].quantity).toBe(10);
  });

  it("itemId가 빈 문자열이면 쿼리 비활성화", () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useItemLocationsQuery(""), { wrapper: Wrapper });
    expect(result.current.fetchStatus).toBe("idle");
  });
});

// ---------------------------------------------------------------------------
// useReceiveInventoryMutation — POST /api/inventory/receive
// ---------------------------------------------------------------------------

describe("useReceiveInventoryMutation (MSW)", () => {
  it("입고 성공: item_id 일치 응답", async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useReceiveInventoryMutation(), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({ item_id: "item-1", quantity: 10 });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const data = result.current.data as { item_id: string };
    expect(data.item_id).toBe("item-1");
  });
});

// ---------------------------------------------------------------------------
// useAdjustInventoryMutation — POST /api/inventory/adjust
// ---------------------------------------------------------------------------

describe("useAdjustInventoryMutation (MSW)", () => {
  it("조정 성공: item_id 일치 응답", async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAdjustInventoryMutation(), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({ item_id: "item-2", quantity: -3, reason: "재고실사" });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const data = result.current.data as { item_id: string };
    expect(data.item_id).toBe("item-2");
  });
});

// ---------------------------------------------------------------------------
// useTransferToProductionMutation — POST /api/inventory/transfer-to-production
// ---------------------------------------------------------------------------

describe("useTransferToProductionMutation (MSW)", () => {
  it("창고→생산 이동 성공", async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useTransferToProductionMutation(), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({ item_id: "item-1", quantity: 5, department: "조립" });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

// ---------------------------------------------------------------------------
// useTransferToWarehouseMutation — POST /api/inventory/transfer-to-warehouse
// ---------------------------------------------------------------------------

describe("useTransferToWarehouseMutation (MSW)", () => {
  it("생산→창고 이동 성공", async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useTransferToWarehouseMutation(), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({ item_id: "item-1", quantity: 3, department: "조립" });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

// ---------------------------------------------------------------------------
// useMarkDefectiveMutation — POST /api/inventory/mark-defective
// ---------------------------------------------------------------------------

describe("useMarkDefectiveMutation (MSW)", () => {
  it("불량 처리 성공: item_id 일치 응답", async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMarkDefectiveMutation(), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({
        item_id: "item-1",
        quantity: 1,
        source: "warehouse",
        target_department: "조립",
      });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const data = result.current.data as { item_id: string };
    expect(data.item_id).toBe("item-1");
  });

  it("404 응답 시 isError === true", async () => {
    server.use(
      http.post("*/api/inventory/mark-defective", () =>
        HttpResponse.json({ detail: "Not found" }, { status: 404 }),
      ),
    );
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMarkDefectiveMutation(), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({
        item_id: "item-x",
        quantity: 1,
        source: "warehouse",
        target_department: "조립",
      });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
