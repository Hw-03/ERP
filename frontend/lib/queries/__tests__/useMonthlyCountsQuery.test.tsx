import { afterEach, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { productionApi } from "@/lib/api/production";
import { useMonthlyCountsQuery } from "../useTransactionsQuery";

afterEach(() => vi.restoreAllMocks());

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
let client: QueryClient;

it("defers the request until enabled and reuses the cached month counts", async () => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
  const get = vi.spyOn(productionApi, "getMonthlyCounts").mockResolvedValue({ "2026-09": 4 });
  const { result, rerender } = renderHook(({ enabled }) => useMonthlyCountsQuery(2026, { enabled }), {
    wrapper, initialProps: { enabled: false },
  });
  expect(get).not.toHaveBeenCalled();
  rerender({ enabled: true });
  await waitFor(() => expect(result.current.data).toEqual({ "2026-09": 4 }));
  rerender({ enabled: false });
  rerender({ enabled: true });
  expect(get).toHaveBeenCalledTimes(1);
});

it("keeps existing callers enabled by default", async () => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const get = vi.spyOn(productionApi, "getMonthlyCounts").mockResolvedValue({});
  const { result } = renderHook(() => useMonthlyCountsQuery(2026), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(get).toHaveBeenCalledWith(2026);
});
