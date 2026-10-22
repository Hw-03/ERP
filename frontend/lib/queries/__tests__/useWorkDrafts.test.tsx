import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { workDraftsApi } from "@/lib/api/work-drafts";
import { ApiError } from "@/lib/api-core";
import { OPERATOR_LOGIN_CHANGED } from "@/lib/auth/login-recovery";
import type { WorkDraftList, WorkDraftSelection } from "@/lib/api/types/work-drafts";
import { queryKeys } from "../keys";
import { useWorkDrafts } from "../useWorkDrafts";
import { invalidateWorkReservationQueries } from "../workReservationInvalidation";

vi.mock("@/lib/auth/operator-session", () => ({
  restoreOperatorSession: (employeeId?: string) => !employeeId || employeeId === "a"
    ? { employee_id: "a", token: "renewed-a" } : null,
}));

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}
const empty: WorkDraftList = { items: [], total: 0, skip: 0, limit: 30 };
afterEach(() => vi.restoreAllMocks());

describe("직원 전체 저장 작업 쿼리", () => {
  it("로그인 직원이 없을 때 조회하지 않는다", async () => {
    const list = vi.spyOn(workDraftsApi, "list").mockResolvedValue(empty);
    const { wrapper } = setup();
    const { rerender, result } = renderHook(({ actor }) => useWorkDrafts(actor, {}, null), {
      wrapper, initialProps: { actor: null as string | null },
    });
    expect(list).not.toHaveBeenCalled();
    rerender({ actor: "a" });
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    expect(list).toHaveBeenCalledWith("a", {}, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("직원 전환 시 이전 상세와 늦은 응답을 버리고 요청을 취소한다", async () => {
    let resolveOld: (value: WorkDraftList) => void = () => undefined;
    let oldSignal: AbortSignal | undefined;
    const list = vi.spyOn(workDraftsApi, "list").mockImplementation((actor, _filters, options) => {
      if (actor === "a") {
        oldSignal = options?.signal;
        return new Promise((resolve) => { resolveOld = resolve; });
      }
      return Promise.resolve({ ...empty, total: 2 });
    });
    const detail = vi.spyOn(workDraftsApi, "getDetail").mockResolvedValue({ id: "old", kind: "io" } as never);
    const { wrapper, client } = setup();
    const selection: WorkDraftSelection = { kind: "io", id: "old" };
    const { rerender, result } = renderHook(({ actor, selected }) => useWorkDrafts(actor, {}, selected), {
      wrapper, initialProps: { actor: "a", selected: selection as WorkDraftSelection | null },
    });
    await waitFor(() => expect(result.current.detail.isSuccess).toBe(true));
    rerender({ actor: "b", selected: null });
    expect(result.current.detail.data).toBeUndefined();
    await waitFor(() => expect(result.current.list.data?.total).toBe(2));
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => { resolveOld({ ...empty, total: 99 }); });
    expect(result.current.list.data?.total).toBe(2);
    expect(client.getQueryData(queryKeys.stockRequests.workDrafts("a", {}))).toBeUndefined();
    expect(list).toHaveBeenCalledTimes(2);
    expect(detail).toHaveBeenCalledTimes(1);
  });

  it("기존 저장·제출·관리자 삭제 후 작업 쿼리와 함께 최신 목록을 다시 읽는다", async () => {
    const list = vi.spyOn(workDraftsApi, "list").mockResolvedValue(empty);
    const { wrapper, client } = setup();
    const { result } = renderHook(() => useWorkDrafts("a", {}, null), { wrapper });
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    await act(async () => { await invalidateWorkReservationQueries(client); });
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("전체 작업에서 나가면 진행 중인 요청과 상세 캐시를 폐기한다", async () => {
    let requestSignal: AbortSignal | undefined;
    vi.spyOn(workDraftsApi, "list").mockImplementation((_actor, _filters, options) => {
      requestSignal = options?.signal;
      return new Promise(() => undefined);
    });
    vi.spyOn(workDraftsApi, "getDetail").mockResolvedValue({ id: "work", kind: "io" } as never);
    const { wrapper, client } = setup();
    const selection: WorkDraftSelection = { kind: "io", id: "work" };
    const { result, unmount } = renderHook(() => useWorkDrafts("a", {}, selection), { wrapper });
    await waitFor(() => expect(result.current.detail.isSuccess).toBe(true));
    unmount();
    expect(requestSignal?.aborted).toBe(true);
    expect(client.getQueriesData({ queryKey: queryKeys.stockRequests.workDraftsAll("a") })).toEqual([]);
  });

  it("상세가 더 이상 draft가 아니면 오류를 보존하고 자동 재시도하지 않는다", async () => {
    vi.spyOn(workDraftsApi, "list").mockResolvedValue(empty);
    const detail = vi.spyOn(workDraftsApi, "getDetail").mockRejectedValue(new Error("작업이 변경되었습니다."));
    const { wrapper } = setup();
    const { result } = renderHook(() => useWorkDrafts("a", {}, { kind: "io", id: "changed" }), { wrapper });
    await waitFor(() => expect(result.current.detail.isError).toBe(true));
    expect(result.current.detail.data).toBeUndefined();
    expect(detail).toHaveBeenCalledOnce();
  });

  it("동일 직원이 다시 로그인하면 인증 실패한 조회를 새 세션으로 복구한다", async () => {
    const list = vi.spyOn(workDraftsApi, "list")
      .mockRejectedValueOnce(new ApiError("다시 로그인", 401, "OPERATOR_SESSION_INVALID"))
      .mockResolvedValue(empty);
    const { wrapper } = setup();
    const { result } = renderHook(() => useWorkDrafts("a", {}, null), { wrapper });
    await waitFor(() => expect(result.current.list.isError).toBe(true));
    act(() => { window.dispatchEvent(new Event(OPERATOR_LOGIN_CHANGED)); });
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    expect(list).toHaveBeenCalledTimes(2);
  });
});
