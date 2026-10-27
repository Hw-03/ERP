import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTransactionReferenceSummariesQuery, useTransactionsSummaryQuery } from "@/lib/queries/useTransactionsQuery";

afterEach(() => vi.unstubAllGlobals());

describe("history aggregate request cancellation", () => {
  it.each([
    { name: "KPI", useRead: useTransactionsSummaryQuery,
      body: { total: 2, warehouse_count: 2, dept_count: 0, adjust_count: 0, department_counts: {} } },
    { name: "reference", useRead: useTransactionReferenceSummariesQuery, body: [] },
  ])("aborts an obsolete $name read when filters change", async ({ useRead, body }) => {
    let release!: (response: Response) => void;
    const obsolete = new Promise<Response>((resolve) => { release = resolve; });
    let obsoleteSignal: AbortSignal | undefined;
    const fetchSpy = vi.fn()
      .mockImplementationOnce((_url: RequestInfo | URL, init?: RequestInit) => {
        obsoleteSignal = init?.signal ?? undefined;
        return obsolete;
      })
      .mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result, rerender } = renderHook(({ search }) => useRead({ search }), {
      initialProps: { search: "before" }, wrapper,
    });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    rerender({ search: "after" });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(obsoleteSignal?.aborted).toBe(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const newest = result.current.data;
    await act(async () => release(new Response(JSON.stringify(body), { status: 200 })));
    expect(result.current.data).toEqual(newest);
  });
});
