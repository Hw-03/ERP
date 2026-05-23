/**
 * query-transactions.test.ts — MSW + React Query hook 통합 테스트 (W7-4)
 *
 * useTransactionsQuery / useTransactionsSummaryQuery / mutation hook의 동작 검증.
 */

import React from "react";
import { describe, it, expect } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "./msw/server";
import {
  useTransactionsQuery,
  useTransactionsSummaryQuery,
  useTransactionEditsQuery,
  useMetaEditTransactionMutation,
  useQuantityCorrectTransactionMutation,
} from "@/lib/queries/useTransactionsQuery";

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
// useTransactionsQuery — GET /api/inventory/transactions
// ---------------------------------------------------------------------------

describe("useTransactionsQuery (MSW)", () => {
  it("정상 응답: 2개 항목 + 첫 항목 transaction_type 검증", async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useTransactionsQuery(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0].transaction_type).toBe("RECEIVE");
    expect(result.current.data?.[1].transaction_type).toBe("SHIP");
  });

  it("404 응답 시 isError === true", async () => {
    server.use(
      http.get("*/api/inventory/transactions", () =>
        HttpResponse.json({ detail: "Not found" }, { status: 404 }),
      ),
    );
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useTransactionsQuery(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("params 전달 시에도 쿼리 성공", async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useTransactionsQuery({ transactionType: "RECEIVE", limit: 10 }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(Array.isArray(result.current.data)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// useTransactionsSummaryQuery — GET /api/inventory/transactions/summary
// ---------------------------------------------------------------------------

describe("useTransactionsSummaryQuery (MSW)", () => {
  it("정상 응답: total + warehouseCount 검증", async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useTransactionsSummaryQuery(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.total).toBe(2);
    expect(result.current.data?.warehouseCount).toBe(1);
    expect(result.current.data?.departmentCounts).toMatchObject({ 조립: 1 });
  });
});

// ---------------------------------------------------------------------------
// useTransactionEditsQuery — GET /api/inventory/transactions/:logId/edits
// ---------------------------------------------------------------------------

describe("useTransactionEditsQuery (MSW)", () => {
  it("logId가 있을 때 이력 반환", async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useTransactionEditsQuery("log-1"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].reason).toBe("오입력 수정");
  });

  it("logId가 빈 문자열이면 쿼리 비활성화", () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useTransactionEditsQuery(""), { wrapper: Wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// useMetaEditTransactionMutation
// ---------------------------------------------------------------------------

describe("useMetaEditTransactionMutation (MSW)", () => {
  it("PIN 통과(0000) → 성공", async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMetaEditTransactionMutation(), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({
        logId: "log-1",
        payload: {
          notes: "수정된 메모",
          reason: "오입력 수정",
          edited_by_employee_id: "emp-1",
          edited_by_pin: "0000",
        },
      });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("PIN 불일치(1234) → 403 → isError === true", async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMetaEditTransactionMutation(), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({
        logId: "log-1",
        payload: {
          reason: "test",
          edited_by_employee_id: "emp-1",
          edited_by_pin: "1234",
        },
      });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// ---------------------------------------------------------------------------
// useQuantityCorrectTransactionMutation
// ---------------------------------------------------------------------------

describe("useQuantityCorrectTransactionMutation (MSW)", () => {
  it("PIN 통과 → original + correction 응답 검증", async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useQuantityCorrectTransactionMutation(),
      { wrapper: Wrapper },
    );

    await act(async () => {
      result.current.mutate({
        logId: "log-1",
        payload: {
          quantity_change: -1,
          reason: "수량 오기입",
          edited_by_employee_id: "emp-1",
          edited_by_pin: "0000",
        },
      });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const data = result.current.data as { original: { log_id: string }; correction: { log_id: string } };
    expect(data.original.log_id).toBe("log-1");
    expect(data.correction.log_id).toBe("log-corr");
  });

  it("PIN 불일치 → isError === true", async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useQuantityCorrectTransactionMutation(),
      { wrapper: Wrapper },
    );

    await act(async () => {
      result.current.mutate({
        logId: "log-1",
        payload: {
          quantity_change: -1,
          reason: "test",
          edited_by_employee_id: "emp-1",
          edited_by_pin: "9999",
        },
      });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
