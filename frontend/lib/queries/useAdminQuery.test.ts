/**
 * W7-10 useAdminQuery 단위 테스트
 * MSW adminHandlers를 통해 실제 네트워크 모킹.
 */

import { describe, it, expect } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import {
  useAuditCsvFilesQuery,
  useVerifyAdminPinMutation,
  useUpdateAdminPinMutation,
  useTriggerAuditCsvBackfillMutation,
} from "./useAdminQuery";

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: 0 }, mutations: { retry: 0 } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  Wrapper.displayName = "TestQueryWrapper";
  return Wrapper;
}

describe("useAuditCsvFilesQuery", () => {
  it("감사 CSV 파일 목록을 반환한다", async () => {
    const { result } = renderHook(() => useAuditCsvFilesQuery(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(Array.isArray(result.current.data)).toBe(true);
    expect(result.current.data!.length).toBeGreaterThan(0);
  });
});

describe("useVerifyAdminPinMutation", () => {
  it("올바른 PIN(0000)으로 인증 성공", async () => {
    const { result } = renderHook(() => useVerifyAdminPinMutation(), {
      wrapper: makeWrapper(),
    });
    result.current.mutate("0000");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ message: "ok" });
  });

  it("잘못된 PIN으로 인증 실패(403)", async () => {
    const { result } = renderHook(() => useVerifyAdminPinMutation(), {
      wrapper: makeWrapper(),
    });
    result.current.mutate("9999");
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useUpdateAdminPinMutation", () => {
  it("PIN 변경 mutation이 존재한다", () => {
    const { result } = renderHook(() => useUpdateAdminPinMutation(), {
      wrapper: makeWrapper(),
    });
    expect(typeof result.current.mutate).toBe("function");
  });
});

describe("useTriggerAuditCsvBackfillMutation", () => {
  it("백필 트리거 성공", async () => {
    const { result } = renderHook(() => useTriggerAuditCsvBackfillMutation(), {
      wrapper: makeWrapper(),
    });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.total_rows).toBeGreaterThan(0);
  });
});
