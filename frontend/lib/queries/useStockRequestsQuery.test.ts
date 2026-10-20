/**
 * W7-8 useStockRequestsQuery 단위 테스트
 * MSW stockRequestsHandlers를 통해 실제 네트워크 모킹.
 */

import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { http, HttpResponse } from "msw";
import { server } from "@/lib/__tests__/msw/server";
import {
  useWarehouseQueueQuery,
  useApproveStockRequestMutation,
  useRejectStockRequestMutation,
  useCancelStockRequestMutation,
  useRevertToDraftMutation,
} from "./useStockRequestsQuery";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: 0 }, mutations: { retry: 0 } },
  });
}

function makeWrapper(qc = makeQueryClient()) {
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
    const qc = makeQueryClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries").mockResolvedValue();
    const { result } = renderHook(() => useApproveStockRequestMutation(), {
      wrapper: makeWrapper(qc),
    });
    result.current.mutate({
      requestId: "req-1",
      payload: { actor_employee_id: "e1", pin: "0000" },
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.status).toBe("approved");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["stockRequests"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["notifications"] });
  });

  it("잘못된 PIN으로 승인 실패(403)", async () => {
    const qc = makeQueryClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries").mockResolvedValue();
    const { result } = renderHook(() => useApproveStockRequestMutation(), {
      wrapper: makeWrapper(qc),
    });
    result.current.mutate({
      requestId: "req-1",
      payload: { actor_employee_id: "e1", pin: "9999" },
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe("useRejectStockRequestMutation", () => {
  it("올바른 PIN으로 반려 성공", async () => {
    const qc = makeQueryClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries").mockResolvedValue();
    const { result } = renderHook(() => useRejectStockRequestMutation(), {
      wrapper: makeWrapper(qc),
    });
    result.current.mutate({
      requestId: "req-1",
      payload: { actor_employee_id: "e1", pin: "0000" },
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.status).toBe("rejected");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["stockRequests"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["notifications"] });
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

describe("useRevertToDraftMutation", () => {
  it("캐시 무효화가 끝나기를 기다리지 않고 호출별 성공 콜백을 실행한다", async () => {
    let releaseInvalidation!: () => void;
    const invalidation = new Promise<void>((resolve) => {
      releaseInvalidation = resolve;
    });
    const qc = makeQueryClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries").mockReturnValue(invalidation);
    const onSuccess = vi.fn();
    server.use(
      http.post("*/api/stock-requests/:id/revert-to-draft", () =>
        HttpResponse.json({ batch_id: "reverted-draft" }),
      ),
    );
    const { result } = renderHook(() => useRevertToDraftMutation(), {
      wrapper: makeWrapper(qc),
    });

    result.current.mutate(
      { requestId: "req-1", payload: { actor_employee_id: "e1", pin: "0000" } },
      { onSuccess },
    );

    try {
      await waitFor(() =>
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["stockRequests"] }),
      );
      await waitFor(() => expect(onSuccess).toHaveBeenCalled());
      expect(onSuccess.mock.calls[0][0]).toEqual(
        expect.objectContaining({ batch_id: "reverted-draft" }),
      );
    } finally {
      releaseInvalidation();
      await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    }
  });
});
