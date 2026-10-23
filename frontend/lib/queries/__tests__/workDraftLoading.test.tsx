import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { workDraftsApi } from "@/lib/api/work-drafts";
import { stockRequestsApi } from "@/lib/api/stock-requests";
import { ioApi } from "@/lib/api/io";
import { ApiError } from "@/lib/api-core";
import { OPERATOR_LOGIN_CHANGED } from "@/lib/auth/login-recovery";
import { installWorkDraftCacheGuard } from "../workDraftCache";
import { useWorkDraftCount } from "../useWorkDraftCount";
import { useDraftCartQuery } from "../useDraftCartQuery";
import { queryKeys } from "../keys";

const cleanups: Array<() => void> = [];
const sessionState = vi.hoisted(() => ({ valid: true }));
vi.mock("@/lib/auth/operator-session", () => ({
  restoreOperatorSession: (employeeId = "a") => sessionState.valid ? { employee_id: employeeId, token: "test-token" } : null,
}));
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const identity = { current: "employee-a:login-1" };
  cleanups.push(installWorkDraftCacheGuard(client, () => identity.current), () => client.clear());
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper, identity };
}
afterEach(() => { sessionState.valid = true; cleanups.splice(0).forEach((cleanup) => cleanup()); vi.restoreAllMocks(); });

describe("작업 중 경량 조회와 로그인 경계", () => {
  it("전체 작업은 숨겨진 내 작업을 조회하지 않는다", async () => {
    const stock = vi.spyOn(stockRequestsApi, "listStockRequestDrafts").mockResolvedValue([]);
    const io = vi.spyOn(ioApi, "listDrafts").mockResolvedValue([]);
    const { wrapper } = setup();
    const { rerender, result } = renderHook(({ enabled }) => useDraftCartQuery("a", { enabled }), {
      wrapper, initialProps: { enabled: false },
    });
    expect(stock).not.toHaveBeenCalled(); expect(io).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(stock).toHaveBeenCalledTimes(1); expect(io).toHaveBeenCalledTimes(1);
    rerender({ enabled: false }); rerender({ enabled: true });
    expect(result.current.data).toEqual({ stockDrafts: [], ioDrafts: [] });
    await waitFor(() => expect(io).toHaveBeenCalledTimes(2));
    expect(stock).toHaveBeenCalledTimes(2);
  });

  it("건수 조회는 상세 API 없이 실행하고 갱신 실패 때 이전 값을 유지한다", async () => {
    const count = vi.spyOn(workDraftsApi, "count").mockResolvedValueOnce({ io_count: 3, stock_request_count: 0, total: 3 })
      .mockRejectedValue(new Error("offline"));
    const list = vi.spyOn(ioApi, "listDrafts");
    const { wrapper } = setup();
    const { result } = renderHook(() => useWorkDraftCount("a"), { wrapper });
    await waitFor(() => expect(result.current.data?.total).toBe(3));
    await act(async () => { await result.current.refetch(); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data?.total).toBe(3);
    expect(count).toHaveBeenCalledTimes(2); expect(list).not.toHaveBeenCalled();
  });

  it("화면 밖에서도 로그인·직원·권한 경계가 바뀌면 저장 작업 캐시를 폐기한다", () => {
    const { client, identity } = setup();
    client.setQueryData(queryKeys.stockRequests.drafts("a"), { private: true });
    client.setQueryData(queryKeys.stockRequests.workDrafts("a", {}), { private: true });
    client.setQueryData(queryKeys.items.list({}), ["unrelated"]);
    identity.current = "employee-b:login-2";
    act(() => { window.dispatchEvent(new Event(OPERATOR_LOGIN_CHANGED)); });
    expect(client.getQueryData(queryKeys.stockRequests.drafts("a"))).toBeUndefined();
    expect(client.getQueryData(queryKeys.stockRequests.workDrafts("a", {}))).toBeUndefined();
    expect(client.getQueryData(queryKeys.items.list({}))).toEqual(["unrelated"]);
  });

  it("인증 실패한 재조회는 직전 건수를 다시 표시하지 않는다", async () => {
    const count = vi.spyOn(workDraftsApi, "count").mockResolvedValueOnce({ io_count: 3, stock_request_count: 0, total: 3 })
      .mockRejectedValue(new ApiError("expired", 401, "OPERATOR_SESSION_INVALID"));
    const { wrapper, client } = setup();
    const { result } = renderHook(() => useWorkDraftCount("a"), { wrapper });
    await waitFor(() => expect(result.current.data?.total).toBe(3));
    await act(async () => { await result.current.refetch(); });
    await waitFor(() => expect(result.current.data).toBeUndefined());
    expect(result.current.isError).toBe(true);
    expect(count).toHaveBeenCalledTimes(2);
    expect(client.getQueriesData({ queryKey: queryKeys.stockRequests.workDraftsAll("a") }).every(([, data]) => data === undefined)).toBe(true);
  });

  it("로컬 세션 만료는 네트워크 응답 전에 캐시를 가린다", async () => {
    vi.spyOn(workDraftsApi, "count").mockResolvedValue({ io_count: 3, stock_request_count: 0, total: 3 });
    const { wrapper } = setup();
    const { result, rerender } = renderHook(() => useWorkDraftCount("a"), { wrapper });
    await waitFor(() => expect(result.current.data?.total).toBe(3));
    sessionState.valid = false;
    rerender();
    expect(result.current.data).toBeUndefined();
  });
});
