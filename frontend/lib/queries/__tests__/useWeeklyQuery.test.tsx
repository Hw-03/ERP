import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWeeklyReportQuery } from "../useWeeklyQuery";

function makeResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as Response;
}

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 5 * 60_000, gcTime: 5 * 60_000 },
    },
  });
}

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const sampleReport = {
  groups: [],
  detail_rows: [],
  production_matrix: [{ model_label: "SOLO", tf_qty: "1.0000", total_qty: "1.0000" }],
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("useWeeklyReportQuery", () => {
  it("serves a remount from cache without entering loading state", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(sampleReport)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const client = makeClient();
    const params = { week_start: "2026-07-05", week_end: "2026-07-11" };

    const first = renderHook(() => useWeeklyReportQuery(params), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(first.result.current.data?.production_matrix[0]?.total_qty).toBe(1));
    first.unmount();

    const callCount = fetchSpy.mock.calls.length;
    const second = renderHook(() => useWeeklyReportQuery(params), {
      wrapper: makeWrapper(client),
    });

    expect(second.result.current.isLoading).toBe(false);
    expect(second.result.current.data?.production_matrix[0]?.total_qty).toBe(1);
    expect(fetchSpy.mock.calls.length).toBe(callCount);
  });
});
