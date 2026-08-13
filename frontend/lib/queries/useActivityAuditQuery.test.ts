import { createElement, type ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  listActivityAuditFiles: vi.fn(),
}));

vi.mock("@/lib/api/admin", () => ({
  adminApi: { listActivityAuditFiles: state.listActivityAuditFiles },
}));

import { useActivityAuditListQuery } from "./useSettingsQuery";

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe("useActivityAuditListQuery", () => {
  beforeEach(() => {
    state.listActivityAuditFiles.mockReset();
  });

  it("작업 감사 월별 파일 목록을 반환한다", async () => {
    const files = [
      { month: "2026-08", file_name: "activity_audit_2026-08.csv", row_count: 4, size_bytes: 256 },
    ];
    state.listActivityAuditFiles.mockResolvedValue(files);

    const { result } = renderHook(() => useActivityAuditListQuery(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(files);
    expect(state.listActivityAuditFiles).toHaveBeenCalledOnce();
  });
});
