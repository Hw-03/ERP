import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { costsApi } from "@/lib/api/costs";
import { useCostQuery, useCostSummaryQueries, useSaveCostStandardsMutation, useCostPurchaseInfoQuery, useSaveCostPurchaseInfoMutation } from "../useCostQuery";
import { ApiError } from "@/lib/api-core";

vi.mock("@/lib/api/costs", () => ({ costsApi: { getItemCost: vi.fn(), getItemSummaries: vi.fn(), updateItemStandards: vi.fn(), getPurchaseInfo: vi.fn(), updatePurchaseInfo: vi.fn() } }));
const session = { employee_id: "actor-a", token: "token-a" };
function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { qc, wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider> };
}
describe("원가 조회 경계", () => {
  it("하위 수율 정보 저장 후 같은 시급의 현재·상위 예상 원가를 재조회한다", async () => {
    let saved = false;
    vi.mocked(costsApi.getItemCost).mockImplementation(async id => ({ item_id: id, unit_cost: "100", yield_adjusted_unit_cost: saved ? "125" : "100" }) as never);
    vi.mocked(costsApi.updatePurchaseInfo).mockImplementation(async () => { saved = true; return { item_id: "child", standard_yield_percent: "80.00" } as never; });
    const { wrapper } = setup();
    const { result } = renderHook(() => ({ parent: useCostQuery("parent", session, "6000"), child: useCostQuery("child", session, "6000"), save: useSaveCostPurchaseInfoMutation("child", session) }), { wrapper });
    await waitFor(() => expect(result.current.parent.data?.yield_adjusted_unit_cost).toBe("100"));
    await act(async () => { await result.current.save.mutateAsync({ standard_yield_percent: "80" }); });
    await waitFor(() => expect(result.current.parent.data?.yield_adjusted_unit_cost).toBe("125"));
    expect(result.current.child.data?.yield_adjusted_unit_cost).toBe("125");
    expect(result.current.parent.data?.unit_cost).toBe("100");
  });
  it("시뮬레이션별 캐시를 분리하고 이전 시급의 늦은 응답을 섞지 않는다", async () => {
    let finish!: (value: unknown) => void;
    vi.mocked(costsApi.getItemCost).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }) as never)
      .mockResolvedValueOnce({ item_id: "a", unit_cost: "200" } as never);
    const { wrapper } = setup();
    const { result, rerender } = renderHook(({ rate }) => useCostQuery("a", session, rate), { wrapper, initialProps: { rate: "10000" } });
    rerender({ rate: "20000" });
    await waitFor(() => expect(result.current.data?.unit_cost).toBe("200"));
    await act(async () => finish({ item_id: "a", unit_cost: "100" }));
    expect(result.current.data?.unit_cost).toBe("200");
    expect(costsApi.getItemCost).toHaveBeenLastCalledWith("a", "token-a", expect.any(AbortSignal), "20000");
  });
  beforeEach(() => vi.clearAllMocks());
  it("다른 작업자의 이전 정보 응답을 섞지 않고 저장 뒤 관련 기준 조회를 갱신한다", async () => {
    let finish!: (value: unknown) => void;
    vi.mocked(costsApi.getPurchaseInfo).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }) as never).mockResolvedValue({ item_id: "b" } as never);
    vi.mocked(costsApi.updatePurchaseInfo).mockResolvedValue({ item_id: "b" } as never);
    const { wrapper, qc } = setup();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result, rerender } = renderHook(({ id, actor }) => ({ info: useCostPurchaseInfoQuery(id, actor), save: useSaveCostPurchaseInfoMutation(id, actor) }), { wrapper, initialProps: { id: "a", actor: session } });
    rerender({ id: "b", actor: { employee_id: "other", token: "other-token" } });
    await waitFor(() => expect(result.current.info.data?.item_id).toBe("b"));
    await act(async () => finish({ item_id: "a", supplier: "old" }));
    expect(result.current.info.data?.item_id).toBe("b");
    await act(async () => { await result.current.save.mutateAsync({ min_stock: 0 }); });
    for (const key of [["costs"], ["items"], ["inventory"]]) expect(invalidate).toHaveBeenCalledWith({ queryKey: key });
  });
  it("목록은 페이지별 한 번 조회하며 기준값 변경 시 다시 읽고 계정을 분리한다", async () => {
    vi.mocked(costsApi.getItemSummaries).mockImplementation(async ids => ids.map(item_id => ({ item_id, unit_cost: "25", amount: "25", own_labor_cost: null, status: "partial" })));
    const { wrapper, qc } = setup();
    const { result, rerender } = renderHook(({ actor }) => useCostSummaryQueries([["a", "b"], ["c"]], actor), { wrapper, initialProps: { actor: session } });
    await waitFor(() => expect(result.current.every(query => query.isSuccess)).toBe(true));
    expect(costsApi.getItemSummaries).toHaveBeenCalledTimes(2);
    expect(costsApi.getItemSummaries).toHaveBeenCalledWith(["a", "b"], "token-a", expect.any(AbortSignal));
    await act(async () => { await qc.invalidateQueries({ queryKey: ["costs"] }); });
    expect(costsApi.getItemSummaries).toHaveBeenCalledTimes(4);
    rerender({ actor: { employee_id: "other", token: "other-token" } });
    await waitFor(() => expect(costsApi.getItemSummaries).toHaveBeenCalledTimes(6));
    expect(costsApi.getItemSummaries).toHaveBeenCalledWith(["c"], "other-token", expect.any(AbortSignal));
  });
  it("품목·작업자 전환 뒤 늦게 도착한 이전 원가를 표시하지 않는다", async () => {
    let finish!: (value: unknown) => void;
    vi.mocked(costsApi.getItemCost).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }) as never)
      .mockResolvedValueOnce({ item_id: "b", unit_cost: "200" } as never);
    const { wrapper } = setup();
    const { result, rerender } = renderHook(({ id, actor }) => useCostQuery(id, actor), { wrapper, initialProps: { id: "a", actor: session } });
    rerender({ id: "b", actor: { employee_id: "actor-b", token: "token-b" } });
    await waitFor(() => expect(result.current.data?.item_id).toBe("b"));
    await act(async () => finish({ item_id: "a", unit_cost: "100" }));
    expect(result.current.data?.item_id).toBe("b");
  });
  it.each([401, 403])("인증·권한 실패(%s)는 반복 요청하지 않는다", async (status) => {
    vi.mocked(costsApi.getItemCost).mockRejectedValue(new ApiError("접근할 수 없습니다", status));
    const { wrapper } = setup();
    const { result } = renderHook(() => useCostQuery("a", session), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(costsApi.getItemCost).toHaveBeenCalledTimes(1);
  });
  it("하위 품목 기준값 저장 후 모든 상위 원가를 새로 조회한다", async () => {
    const { wrapper, qc } = setup();
    qc.setQueryData(["costs", "item", "actor-a", "token-a", "parent"], { item_id: "parent" });
    vi.mocked(costsApi.updateItemStandards).mockResolvedValue({ item_id: "child" } as never);
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useSaveCostStandardsMutation(session), { wrapper });
    await act(async () => result.current.mutateAsync({ itemId: "child", standards: { standard_work_minutes: "5" } }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["costs"] });
  });
  it("기준값 저장 전에 시작된 최초 원가 조회도 취소하고 최신 값으로 다시 읽는다", async () => {
    let finish!: (value: unknown) => void;
    vi.mocked(costsApi.getItemCost).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }) as never)
      .mockResolvedValue({ item_id: "parent", unit_cost: "200" } as never);
    vi.mocked(costsApi.updateItemStandards).mockResolvedValue({ item_id: "child" } as never);
    const { wrapper } = setup();
    const { result } = renderHook(() => ({ cost: useCostQuery("parent", session), save: useSaveCostStandardsMutation(session) }), { wrapper });
    await act(async () => result.current.save.mutateAsync({ itemId: "child", standards: { standard_purchase_price: "200" } }));
    await waitFor(() => expect(result.current.cost.data?.unit_cost).toBe("200"));
    await act(async () => finish({ item_id: "parent", unit_cost: "100" }));
    expect(result.current.cost.data?.unit_cost).toBe("200");
  });
});
