/**
 * W7-7 useSettingsQuery 단위 테스트
 * MSW settingsHandlers를 통해 실제 네트워크 모킹.
 */

import { describe, it, expect } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import {
  useAuditCsvListQuery,
  useVerifyPinMutation,
  useUpdatePinMutation,
} from "./useSettingsQuery";

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: 0 }, mutations: { retry: 0 } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  Wrapper.displayName = "TestQueryWrapper";
  return Wrapper;
}

describe("useAuditCsvListQuery", () => {
  it("파일 목록을 반환한다", async () => {
    const { result } = renderHook(() => useAuditCsvListQuery(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(Array.isArray(result.current.data)).toBe(true);
    expect(result.current.data!.length).toBeGreaterThan(0);
  });
});

describe("useVerifyPinMutation", () => {
  it("올바른 PIN(0000)으로 검증 성공", async () => {
    const { result } = renderHook(() => useVerifyPinMutation(), {
      wrapper: makeWrapper(),
    });
    result.current.mutate("0000");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ message: "ok" });
  });

  it("잘못된 PIN으로 검증 실패(403)", async () => {
    const { result } = renderHook(() => useVerifyPinMutation(), {
      wrapper: makeWrapper(),
    });
    result.current.mutate("9999");
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useUpdatePinMutation", () => {
  it("올바른 current_pin으로 PIN 변경 성공", async () => {
    const { result } = renderHook(() => useUpdatePinMutation(), {
      wrapper: makeWrapper(),
    });
    result.current.mutate({ current_pin: "0000", new_pin: "1234" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("잘못된 current_pin으로 PIN 변경 실패(403)", async () => {
    const { result } = renderHook(() => useUpdatePinMutation(), {
      wrapper: makeWrapper(),
    });
    result.current.mutate({ current_pin: "9999", new_pin: "1234" });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
