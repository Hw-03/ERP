import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dailyWorkReportsApi } from "@/lib/api/daily-work-reports";
import { queryKeys } from "../keys";
import { useDailyWorkActivityQuery } from "../useDailyWorkReportsQuery";

vi.mock("@/lib/api/daily-work-reports", () => ({
  dailyWorkReportsApi: { activity: vi.fn() },
}));

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("useDailyWorkActivityQuery", () => {
  afterEach(() => vi.resetAllMocks());

  it("오늘 일보 활동은 30초마다 갱신하고 화면 복귀 시 즉시 다시 조회한다", async () => {
    vi.mocked(dailyWorkReportsApi.activity).mockResolvedValue({
      work_date: "2026-08-03",
      employee_id: "employee-1",
      summary: [],
      cancelled_count: 0,
      details: [],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(
      () => useDailyWorkActivityQuery("employee-1", "2026-08-03", { live: true }),
      { wrapper: makeWrapper(client) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const query = client.getQueryCache().find({
      queryKey: queryKeys.dailyWorkReports.activity("employee-1", "2026-08-03"),
    });

    expect(query?.options.staleTime).toBe(30_000);
    expect(query?.options.refetchInterval).toBe(30_000);
    expect(query?.options.refetchOnWindowFocus).toBe(true);
  });
});
