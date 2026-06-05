/**
 * W7-8 useStockRequestsQuery 단위 테스트
 * MSW stockRequestsHandlers를 통해 실제 네트워크 모킹.
 */

import { describe, it, expect } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import {
  useWarehouseQueueQuery,
  useApproveStockRequestMutation,
  useRejectStockRequestMutation,
  useCancelStockRequestMutation,
} from "./useStockRequestsQuery";

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: 0 }, mutations: { retry: 0 } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  Wrapper.displayName = "TestQueryWrapper";
  return Wrapper;
}

describe("useWarehouseQueueQuery", () => {
  it("창고 대기열 목록을 반환한다", async () => {
    const { result } = renderHook(() => useWarehouseQueueQuery(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(Array.isArray(result.current.data)).toBe(true);
    expect(result.current.data!.length).toBe(2);
  });
});

describe("useApproveStockRequestMutation", () => {
  it("올바른 PIN으로 승인 성공", async () => {
    const { result } = renderHook(() => useApproveStockRequestMutation(), {
      wrapper: makeWrapper(),
    });
    result.current.mutate({
      requestId: "req-1",
      payload: { actor_employee_id: "e1", pin: "0000" },
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.status).toBe("approved");
  });

  it("잘못된 PIN으로 승인 실패(403)", async () => {
    const { result } = renderHook(() => useApproveStockRequestMutation(), {
      wrapper: makeWrapper(),
    });
    result.current.mutate({
      requestId: "req-1",
      payload: { actor_employee_id: "e1", pin: "9999" },
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useRejectStockRequestMutation", () => {
  it("올바른 PIN으로 반려 성공", async () => {
    const { result } = renderHook(() => useRejectStockRequestMutation(), {
      wrapper: makeWrapper(),
    });
    result.current.mutate({
      requestId: "req-1",
      payload: { actor_employee_id: "e1", pin: "0000" },
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.status).toBe("rejected");
  });
});

describe("useCancelStockRequestMutation", () => {
  it("취소 성공", async () => {
    const { result } = renderHook(() => useCancelStockRequestMutation(), {
      wrapper: makeWrapper(),
    });
    result.current.mutate({
      requestId: "req-1",
      payload: { actor_employee_id: "e1", pin: "0000" },
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.status).toBe("cancelled");
  });
});
