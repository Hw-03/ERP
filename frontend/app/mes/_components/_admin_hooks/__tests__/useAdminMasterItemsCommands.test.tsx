import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const createMutateAsync = vi.fn();
const reorderMutate = vi.fn();

vi.mock("@/lib/queries/useItemsQuery", () => ({
  useCreateItemMutation: () => ({ mutateAsync: createMutateAsync }),
  useReorderItemsMutation: () => ({ mutate: reorderMutate }),
}));

import { useAdminMasterItemsCommands } from "../useAdminMasterItemsCommands";

function makeClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const baseArgs = (over: Partial<Parameters<typeof useAdminMasterItemsCommands>[0]> = {}) => ({
  setItems: vi.fn(),
  setSelectedItem: vi.fn(),
  onStatusChange: vi.fn(),
  onError: vi.fn(),
  adminPin: "0000",
  ...over,
});

describe("useAdminMasterItemsCommands", () => {
  beforeEach(() => {
    createMutateAsync.mockReset();
    reorderMutate.mockReset();
  });

  it("초기 — addMode=false, addForm 빈값", () => {
    const { result } = renderHook(() => useAdminMasterItemsCommands(baseArgs()), {
      wrapper: makeWrapper(makeClient()),
    });
    expect(result.current.addMode).toBe(false);
    expect(result.current.addForm.item_name).toBe("");
  });

  it("setAddMode 토글", () => {
    const { result } = renderHook(() => useAdminMasterItemsCommands(baseArgs()), {
      wrapper: makeWrapper(makeClient()),
    });
    act(() => {
      result.current.setAddMode(true);
    });
    expect(result.current.addMode).toBe(true);
  });

  it("add — item_name 비어있으면 onError, createMutation 미호출", async () => {
    const args = baseArgs();
    const { result } = renderHook(() => useAdminMasterItemsCommands(args), {
      wrapper: makeWrapper(makeClient()),
    });
    await act(async () => {
      result.current.add();
    });
    await waitFor(() => expect(args.onError).toHaveBeenCalledWith("품목명을 입력하세요."));
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it("add — 성공 시 목록을 임시 선두 배치하지 않고 선택 상태만 갱신한다", async () => {
    createMutateAsync.mockResolvedValue({
      item_id: "100",
      item_name: "신규",
      mes_code: "N-001",
    });
    const args = baseArgs();
    const { result } = renderHook(() => useAdminMasterItemsCommands(args), {
      wrapper: makeWrapper(makeClient()),
    });
    act(() => {
      result.current.setAddMode(true);
      result.current.setAddForm((f) => ({
        ...f,
        item_name: "신규",
        sales_review_required: true,
        legacy_item_type: "원자재",
        min_stock: "0",
        model_slots: [1],
        initial_locations: [{ department: "창고", quantity: "1" }],
      }));
    });
    await act(async () => {
      result.current.add();
    });
    expect(args.setItems).not.toHaveBeenCalled();
    expect(args.setSelectedItem).toHaveBeenCalled();
    expect(createMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ sales_review_required: true }));
    expect(result.current.addMode).toBe(false);
  });

  it("add는 mutation layer가 invalidation을 소유하므로 command에서 중복 무효화하지 않는다", async () => {
    createMutateAsync.mockResolvedValue({
      item_id: "101",
      item_name: "New item",
      mes_code: "N-101",
    });
    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    const { result } = renderHook(() => useAdminMasterItemsCommands(baseArgs()), {
      wrapper: makeWrapper(client),
    });
    act(() => {
      result.current.setAddForm((form) => ({
        ...form,
        item_name: "New item",
        legacy_item_type: "원자재",
        min_stock: "0",
        model_slots: [1],
        initial_locations: [{ department: "창고", quantity: "1" }],
      }));
    });

    await act(async () => {
      result.current.add();
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("allows empty material classification and minimum stock while requiring a product and initial stock location", async () => {
    const args = baseArgs();
    const { result } = renderHook(() => useAdminMasterItemsCommands(args), {
      wrapper: makeWrapper(makeClient()),
    });
    act(() => {
      result.current.setAddForm((form) => ({
        ...form,
        item_name: "신규 품목",
      }));
    });

    await act(async () => {
      result.current.add();
    });
    await waitFor(() => expect(args.onError).toHaveBeenCalledWith("사용 제품을 하나 이상 선택하세요."));

    act(() => {
      result.current.setAddForm((form) => ({ ...form, model_slots: [1] }));
    });
    await act(async () => {
      result.current.add();
    });
    await waitFor(() => expect(args.onError).toHaveBeenLastCalledWith("초기 재고 위치와 수량을 입력하세요."));
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it("reorder sends only active items", () => {
    const { result } = renderHook(() => useAdminMasterItemsCommands(baseArgs()), {
      wrapper: makeWrapper(makeClient()),
    });
    const active = { item_id: "active", deleted_at: null } as any;
    const deleted = { item_id: "deleted", deleted_at: "2026-08-06T00:00:00" } as any;

    act(() => {
      result.current.reorder([active, deleted]);
    });

    expect(reorderMutate).toHaveBeenCalledWith(
      { items: [{ item_id: "active", display_order: 0 }], pin: "0000" },
      expect.any(Object),
    );
  });
});
