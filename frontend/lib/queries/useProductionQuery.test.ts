/**
 * W7-9 useProductionQuery 단위 테스트
 * MSW productionHandlers를 통해 실제 네트워크 모킹.
 */

import { describe, it, expect } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import {
  useProductionCapacityQuery,
  useTransactionsQuery,
  useTransactionEditsQuery,
  useProductionReceiptMutation,
  useMetaEditTransactionMutation,
} from "./useProductionQuery";

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: 0 }, mutations: { retry: 0 } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  Wrapper.displayName = "TestQueryWrapper";
  return Wrapper;
}

describe("useProductionCapacityQuery", () => {
  it("생산 가능량 데이터를 반환한다", async () => {
    const { result } = renderHook(() => useProductionCapacityQuery(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeDefined();
  });
});

describe("useTransactionsQuery", () => {
  it("트랜잭션 목록을 반환한다", async () => {
    const { result } = renderHook(() => useTransactionsQuery(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(Array.isArray(result.current.data)).toBe(true);
  });

  it("파라미터와 함께 트랜잭션 목록을 반환한다", async () => {
    const { result } = renderHook(
      () => useTransactionsQuery({ limit: 10 }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeDefined();
  });
});

describe("useTransactionEditsQuery", () => {
  it("logId가 있으면 편집 이력을 반환한다", async () => {
    const { result } = renderHook(
      () => useTransactionEditsQuery("log-1"),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(Array.isArray(result.current.data)).toBe(true);
  });

  it("logId가 빈 문자열이면 enabled=false로 요청 안 함", () => {
    const { result } = renderHook(() => useTransactionEditsQuery(""), {
      wrapper: makeWrapper(),
    });
    expect(result.current.fetchStatus).toBe("idle");
  });
});

describe("useProductionReceiptMutation", () => {
  it("생산 입고 등록 성공", async () => {
    const { result } = renderHook(() => useProductionReceiptMutation(), {
      wrapper: makeWrapper(),
    });
    result.current.mutate({ item_id: "i-1", quantity: 5 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe("useMetaEditTransactionMutation", () => {
  it("PIN 포함 메타 수정 성공", async () => {
    const { result } = renderHook(() => useMetaEditTransactionMutation(), {
      wrapper: makeWrapper(),
    });
    result.current.mutate({
      logId: "log-1",
      payload: {
        notes: "수정",
        reason: "테스트",
        edited_by_employee_id: "e1",
        edited_by_pin: "0000",
      },
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
