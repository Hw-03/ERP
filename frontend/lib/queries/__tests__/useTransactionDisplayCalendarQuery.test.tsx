import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { productionApi } from "@/lib/api/production";
import { useTransactionDisplayCalendarQuery } from "../useTransactionsQuery";

afterEach(() => vi.restoreAllMocks());

const calendar = (total: number) => ({ days: { "2026-10-14": { total, warehouseCount: total, deptCount: 0, adjustCount: 0, otherCount: 0 } }, months: { "2026-10": total } });

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;
}

describe("history calendar requester filter", () => {
  it("does not request the calendar while it is collapsed", () => {
    const fetch = vi.spyOn(productionApi, "getTransactionDisplayCalendar").mockResolvedValue(calendar(1));
    renderHook(() => useTransactionDisplayCalendarQuery({ year: 2026, month: 10, requesterEmployeeId: "employee-a" }, { enabled: false }), { wrapper });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("isolates employee caches and ignores a late previous employee response", async () => {
    let resolveOld!: (value: ReturnType<typeof calendar>) => void;
    const old = new Promise<ReturnType<typeof calendar>>((resolve) => { resolveOld = resolve; });
    const fetch = vi.spyOn(productionApi, "getTransactionDisplayCalendar").mockImplementation((params) => params.requesterEmployeeId === "employee-a" ? old : Promise.resolve(calendar(2)));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, rerender } = renderHook(({ requesterEmployeeId }) => useTransactionDisplayCalendarQuery({ year: 2026, month: 10, requesterEmployeeId }), {
      initialProps: { requesterEmployeeId: "employee-a" },
      wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    rerender({ requesterEmployeeId: "employee-b" });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data?.months["2026-10"]).toBe(2));
    await act(async () => resolveOld(calendar(1)));
    expect(result.current.data?.months["2026-10"]).toBe(2);
    expect(client.getQueryCache().getAll()).toHaveLength(2);
  });
});
