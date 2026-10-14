import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { productionApi } from "@/lib/api/production";
import { useTransactionDisplayCalendarQuery } from "../useTransactionsQuery";

afterEach(() => vi.restoreAllMocks());

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

const calendar = (total: number) => ({ days: { "2026-10-12": { total, warehouseCount: 0, deptCount: 0, adjustCount: total, otherCount: 0 } }, months: { "2026-10": total } });

function View({ search = "", enabled = true }: { search?: string; enabled?: boolean }) {
  const query = useTransactionDisplayCalendarQuery({ year: 2026, month: 10, search }, { enabled });
  return <><p>{query.data?.months["2026-10"] ?? "pending"}</p>{query.isError && <button onClick={() => void query.refetch()}>재시도</button>}</>;
}

function renderQuery(view: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(view, { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
}

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

describe("work calendar query", () => {
  it("does not fetch while collapsed", async () => {
    const fetch = vi.spyOn(productionApi, "getTransactionDisplayCalendar").mockResolvedValue(calendar(91));
    renderQuery(<View enabled={false} />);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps the new search result when an earlier response arrives late", async () => {
    const old = deferred<ReturnType<typeof calendar>>();
    vi.spyOn(productionApi, "getTransactionDisplayCalendar").mockImplementation(params => params.search === "old" ? old.promise : Promise.resolve(calendar(1)));
    const view = renderQuery(<View search="old" />);
    view.rerender(<View search="new" />);
    await screen.findByText("1");
    await act(async () => { old.resolve(calendar(91)); });
    expect(screen.queryByText("91")).not.toBeInTheDocument();
  });
  it("allows retry after a failure without displaying a false zero", async () => {
    const fetch = vi.spyOn(productionApi, "getTransactionDisplayCalendar").mockRejectedValueOnce(new Error("network")).mockResolvedValue(calendar(91));
    renderQuery(<View />);
    fireEvent.click(await screen.findByRole("button", { name: "재시도" }));
    await screen.findByText("91");
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });
});
