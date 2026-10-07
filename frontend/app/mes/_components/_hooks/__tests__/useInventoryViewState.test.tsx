import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Item } from "@/lib/api";
import { itemsApi as api } from "@/lib/api/items";
import { ApiError } from "@/lib/api-core";
import { queryKeys } from "@/lib/queries/keys";
import { useInventoryViewState } from "../useInventoryViewState";

const session = vi.hoisted(() => ({ employeeId: "employee-a", bootId: "boot-a" }));
vi.mock("../../login/useCurrentOperator", () => ({
  useCurrentOperator: () => session.employeeId ? { employee_id: session.employeeId } : null,
  getStoredBootId: () => session.bootId,
}));
const item = { item_id: "item-a", item_name: "품목 A", deleted_at: null } as Item;
const key = "dexcowin_mes_inventory_view:employee-a";
function wrapper(client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}
function saveSnapshot(detailOpen = true, bootId = "boot-a") {
  window.sessionStorage.setItem(key, JSON.stringify({ version: 1, bootId, search: "검색어", selectedItemId: item.item_id, detailOpen }));
}
beforeEach(() => {
  session.employeeId = "employee-a";
  session.bootId = "boot-a";
  window.sessionStorage.clear();
  vi.spyOn(api, "getItem").mockResolvedValue(item);
});
afterEach(() => vi.restoreAllMocks());

describe("품목 상세 복원", () => {
  it("검색어와 열린 선택 품목을 목록에 없어도 단건 조회로 복원한다", async () => {
    saveSnapshot();
    const { result } = renderHook(() => useInventoryViewState([]), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.detailStatus).toBe("active"));
    expect(result.current.search).toBe("검색어");
    expect(result.current.detailOpen).toBe(true);
    expect(result.current.displayItem?.item_id).toBe(item.item_id);
  });

  it("닫힌 상세는 선택과 검색만 복원하고 단건 조회하지 않는다", async () => {
    saveSnapshot(false);
    const { result } = renderHook(() => useInventoryViewState([item]), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.search).toBe("검색어"));
    expect(result.current.selectedItem?.item_id).toBe(item.item_id);
    expect(result.current.detailOpen).toBe(false);
    expect(api.getItem).not.toHaveBeenCalled();
  });

  it("닫기 후 새로고침에서도 검색과 선택을 유지한다", async () => {
    const view = renderHook(() => useInventoryViewState([item]), { wrapper: wrapper() });
    act(() => { view.result.current.setSearch("품목"); view.result.current.selectItem(item); });
    await waitFor(() => expect(view.result.current.detailStatus).toBe("active"));
    act(() => view.result.current.closeDetail());
    view.unmount();
    const next = renderHook(() => useInventoryViewState([item]), { wrapper: wrapper() });
    await waitFor(() => expect(next.result.current.search).toBe("품목"));
    expect(next.result.current.detailOpen).toBe(false);
    expect(next.result.current.selectedItem?.item_id).toBe(item.item_id);
  });

  it.each(["{bad", JSON.stringify({ version: 2 }), JSON.stringify({ version: 1, bootId: "old", search: "old", selectedItemId: "item-a", detailOpen: true })])("잘못된 저장값 또는 이전 boot는 복원하지 않는다: %s", (raw) => {
    window.sessionStorage.setItem(key, raw);
    const { result } = renderHook(() => useInventoryViewState([item]), { wrapper: wrapper() });
    expect(result.current.search).toBe("");
    expect(result.current.detailOpen).toBe(false);
    expect(api.getItem).not.toHaveBeenCalled();
  });

  it("직원을 바꾸면 이전 직원의 상세와 검색을 노출하지 않는다", async () => {
    saveSnapshot();
    const { result, rerender } = renderHook(() => useInventoryViewState([item]), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.detailStatus).toBe("active"));
    session.employeeId = "employee-b";
    rerender();
    expect(result.current.search).toBe("");
    expect(result.current.detailOpen).toBe(false);
    expect(result.current.displayItem).toBeNull();
  });
});

describe("삭제와 조회 실패", () => {
  it("정상 상세의 배경 갱신은 작업 메뉴 상태를 유지하고 삭제 확인 후 차단한다", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    saveSnapshot();
    const { result } = renderHook(() => useInventoryViewState([]), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.actionsDisabled).toBe(false));
    let resolveRefresh!: (value: Item) => void;
    vi.mocked(api.getItem).mockImplementation(() => new Promise((resolve) => { resolveRefresh = resolve; }));
    act(() => { void client.invalidateQueries({ queryKey: queryKeys.items.all }); });
    await waitFor(() => expect(api.getItem).toHaveBeenCalledTimes(2));
    expect(result.current.actionsDisabled).toBe(false);
    await act(async () => resolveRefresh({ ...item, deleted_at: "2026-10-07T00:00:00Z" }));
    await waitFor(() => expect(result.current.detailStatus).toBe("deleted"));
    expect(result.current.actionsDisabled).toBe(true);
  });

  it("기존 캐시가 fresh여도 다시 열린 상세를 서버에서 확인한다", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 300_000, gcTime: 0 } } });
    client.setQueryData(queryKeys.items.detail(item.item_id), item);
    vi.mocked(api.getItem).mockResolvedValue({ ...item, deleted_at: "2026-10-07T00:00:00Z" });
    const { result } = renderHook(() => useInventoryViewState([item]), { wrapper: wrapper(client) });
    act(() => result.current.selectItem(item));
    await waitFor(() => expect(result.current.detailStatus).toBe("deleted"));
    expect(api.getItem).toHaveBeenCalled();
  });

  it("목록에서 사라져도 열린 상세를 닫지 않는다", async () => {
    saveSnapshot();
    const { result, rerender } = renderHook(({ items }) => useInventoryViewState(items), { initialProps: { items: [item] }, wrapper: wrapper() });
    await waitFor(() => expect(result.current.detailStatus).toBe("active"));
    rerender({ items: [] });
    expect(result.current.detailOpen).toBe(true);
    expect(result.current.displayItem).toEqual(item);
  });

  it("200의 deleted_at만 삭제로 확인하고 상세를 유지한다", async () => {
    vi.mocked(api.getItem).mockResolvedValue({ ...item, deleted_at: "2026-10-07T00:00:00Z" });
    saveSnapshot();
    const { result } = renderHook(() => useInventoryViewState([]), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.detailStatus).toBe("deleted"));
    expect(result.current.detailOpen).toBe(true);
    expect(result.current.actionsDisabled).toBe(true);
  });

  it.each([[404, "not-found"], [401, "access-error"], [403, "access-error"], [503, "read-error"]])("HTTP %s는 삭제로 단정하지 않는다", async (status, expected) => {
    vi.mocked(api.getItem).mockRejectedValue(new ApiError("조회 실패", Number(status)));
    saveSnapshot();
    const { result } = renderHook(() => useInventoryViewState([]), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.detailStatus).toBe(expected));
    expect(result.current.detailOpen).toBe(true);
    expect(result.current.actionsDisabled).toBe(true);
  });

  it("갱신 실패 중 기존 상세를 유지하고 재시도 후 복구한다", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    saveSnapshot();
    const { result } = renderHook(() => useInventoryViewState([]), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.detailStatus).toBe("active"));
    vi.mocked(api.getItem).mockRejectedValue(new ApiError("연결 실패", 503));
    await act(() => client.invalidateQueries({ queryKey: queryKeys.items.all }));
    await waitFor(() => expect(result.current.detailStatus).toBe("read-error"));
    expect(result.current.displayItem).toEqual(item);
    vi.mocked(api.getItem).mockResolvedValue(item);
    await act(() => result.current.retryDetail());
    await waitFor(() => expect(result.current.detailStatus).toBe("active"));
    expect(result.current.actionsDisabled).toBe(false);
  });

  it("새 선택 이후 도착한 이전 상세 응답을 적용하지 않는다", async () => {
    let resolveOld!: (value: Item) => void;
    vi.mocked(api.getItem).mockImplementation((id) => id === item.item_id ? new Promise((resolve) => { resolveOld = resolve; }) : Promise.resolve({ ...item, item_id: "item-b", item_name: "품목 B" }));
    saveSnapshot();
    const { result } = renderHook(() => useInventoryViewState([]), { wrapper: wrapper() });
    await waitFor(() => expect(api.getItem).toHaveBeenCalled());
    act(() => result.current.selectItem({ ...item, item_id: "item-b", item_name: "품목 B" }));
    await waitFor(() => expect(result.current.displayItem?.item_id).toBe("item-b"));
    await act(async () => resolveOld(item));
    expect(result.current.displayItem?.item_id).toBe("item-b");
  });
});
