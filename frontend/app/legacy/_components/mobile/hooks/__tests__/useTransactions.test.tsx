import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("@/lib/api", () => ({
  api: { getTransactions: vi.fn() },
}));

import { api } from "@/lib/api";
import { useTransactions } from "../useTransactions";

function makeLogs(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    log_id: `l${i}`,
    item_id: "i1",
    quantity_change: 1,
    transaction_type: "RECEIVE",
    created_at: "2026-01-01T00:00:00Z",
  }));
}

describe("useTransactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("초기 refetch 결과 반영 + hasMore 판정", async () => {
    (api.getTransactions as any).mockResolvedValue(makeLogs(100));
    const { result } = renderHook(() => useTransactions());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.logs).toHaveLength(100);
    expect(result.current.hasMore).toBe(true);
  });

  it("결과 < page size → hasMore=false", async () => {
    (api.getTransactions as any).mockResolvedValue(makeLogs(20));
    const { result } = renderHook(() => useTransactions());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasMore).toBe(false);
  });

  it("에러 시 error state", async () => {
    (api.getTransactions as any).mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useTransactions());
    await waitFor(() => expect(result.current.error).toBe("network"));
  });
});
