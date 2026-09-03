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
        bom_stock_exempt: true,
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
    expect(createMutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      bom_stock_exempt: true,
      sales_review_required: true,
    }));
    expect(result.current.addMode).toBe(false);
  });

  it("생성 payload는 구매·재고 기준의 공백을 생략하고 값은 형식에 맞춰 변환한다", async () => {
    createMutateAsync.mockResolvedValue({ item_id: "100", item_name: "신규", mes_code: "N-001" });
    const { result } = renderHook(() => useAdminMasterItemsCommands(baseArgs()), {
      wrapper: makeWrapper(makeClient()),
    });
    act(() => {
      result.current.setAddForm((form) => ({
        ...form,
        item_name: "신규",
        model_slots: [1],
        initial_locations: [{ department: "창고", quantity: "1" }],
        supplier: "  공급사  ",
        supplier_item_code: "  SUP-1  ",
        standard_purchase_price: "1234.50",
        purchase_price_effective_date: "2026-09-01",
        min_stock: "10",
        reorder_point: "",
        procurement_lead_time_days: "7",
        minimum_order_quantity: "20",
        purchase_memo: "  납기 전 연락  ",
      }));
    });

    await act(async () => { result.current.add(); });

    expect(createMutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      supplier: "공급사",
      supplier_item_code: "SUP-1",
      standard_purchase_price: "1234.50",
      purchase_price_effective_date: "2026-09-01",
      min_stock: 10,
      procurement_lead_time_days: 7,
      minimum_order_quantity: 20,
      purchase_memo: "납기 전 연락",
    }));
    expect(createMutateAsync.mock.calls[0][0]).not.toHaveProperty("reorder_point");
  });

  it("MOQ가 1 미만이면 생성 API를 호출하지 않는다", async () => {
    const args = baseArgs();
    const { result } = renderHook(() => useAdminMasterItemsCommands(args), {
      wrapper: makeWrapper(makeClient()),
    });
    act(() => {
      result.current.setAddForm((form) => ({
        ...form,
        item_name: "신규",
        model_slots: [1],
        initial_locations: [{ department: "창고", quantity: "1" }],
        minimum_order_quantity: "0",
      }));
    });

    await act(async () => { result.current.add(); });

    expect(args.onError).toHaveBeenCalledWith("최소 발주수량(MOQ)은 1 이상 입력하세요.");
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it.each([
    ["min_stock", "-1", "안전재고는 0 이상 입력하세요."],
    ["reorder_point", "-1", "발주점은 0 이상 입력하세요."],
    ["procurement_lead_time_days", "-1", "조달 리드타임은 0 이상 입력하세요."],
  ] as const)("%s가 음수이면 생성 API를 호출하지 않는다", async (field, value, errorMessage) => {
    const args = baseArgs();
    const { result } = renderHook(() => useAdminMasterItemsCommands(args), {
      wrapper: makeWrapper(makeClient()),
    });
    act(() => {
      result.current.setAddForm((form) => ({
        ...form,
        item_name: "신규",
        model_slots: [1],
        initial_locations: [{ department: "창고", quantity: "1" }],
        [field]: value,
      }));
    });

    await act(async () => { result.current.add(); });

    expect(args.onError).toHaveBeenCalledWith(errorMessage);
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it.each([
    ["min_stock", "1.5", "안전재고는 0 이상 입력하세요."],
    ["reorder_point", "1.5", "발주점은 0 이상 입력하세요."],
    ["procurement_lead_time_days", "1.5", "조달 리드타임은 0 이상 입력하세요."],
    ["minimum_order_quantity", "1.5", "최소 발주수량(MOQ)은 1 이상 입력하세요."],
    ["min_stock", "Infinity", "안전재고는 0 이상 입력하세요."],
    ["reorder_point", "abc", "발주점은 0 이상 입력하세요."],
    ["procurement_lead_time_days", "Infinity", "조달 리드타임은 0 이상 입력하세요."],
    ["minimum_order_quantity", "abc", "최소 발주수량(MOQ)은 1 이상 입력하세요."],
  ] as const)("%s의 잘못된 정수값 %s이면 생성 API를 호출하지 않는다", async (field, value, errorMessage) => {
    const args = baseArgs();
    const { result } = renderHook(() => useAdminMasterItemsCommands(args), {
      wrapper: makeWrapper(makeClient()),
    });
    act(() => {
      result.current.setAddForm((form) => ({
        ...form,
        item_name: "신규",
        model_slots: [1],
        initial_locations: [{ department: "창고", quantity: "1" }],
        [field]: value,
      }));
    });

    await act(async () => { result.current.add(); });

    expect(args.onError).toHaveBeenCalledWith(errorMessage);
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it.each(["abc", "-1", "1.234", "   "])("잘못된 기준 매입단가 %j이면 생성 API를 호출하지 않는다", async (standardPurchasePrice) => {
    const args = baseArgs();
    const { result } = renderHook(() => useAdminMasterItemsCommands(args), {
      wrapper: makeWrapper(makeClient()),
    });
    act(() => {
      result.current.setAddForm((form) => ({
        ...form,
        item_name: "신규",
        model_slots: [1],
        initial_locations: [{ department: "창고", quantity: "1" }],
        standard_purchase_price: standardPurchasePrice,
      }));
    });

    await act(async () => { result.current.add(); });

    expect(args.onError).toHaveBeenCalledWith("기준 매입단가는 0 이상, 소수점 둘째 자리까지 입력하세요.");
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it("유효한 기준 매입단가는 공백을 제거한 문자열로 생성 payload에 보존한다", async () => {
    createMutateAsync.mockResolvedValue({ item_id: "100", item_name: "신규", mes_code: "N-001" });
    const { result } = renderHook(() => useAdminMasterItemsCommands(baseArgs()), {
      wrapper: makeWrapper(makeClient()),
    });
    act(() => {
      result.current.setAddForm((form) => ({
        ...form,
        item_name: "신규",
        model_slots: [1],
        initial_locations: [{ department: "창고", quantity: "1" }],
        standard_purchase_price: " 123.45 ",
      }));
    });

    await act(async () => { result.current.add(); });

    expect(createMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ standard_purchase_price: "123.45" }));
  });

  it("submits zero initial quantity when a warehouse location is selected", async () => {
    createMutateAsync.mockResolvedValue({
      item_id: "zero-stock",
      item_name: "Zero stock item",
      mes_code: "N-000",
    });
    const args = baseArgs();
    const { result } = renderHook(() => useAdminMasterItemsCommands(args), {
      wrapper: makeWrapper(makeClient()),
    });
    act(() => {
      result.current.setAddForm((form) => ({
        ...form,
        item_name: "Zero stock item",
        model_slots: [1],
        initial_locations: [{ department: "창고", quantity: "0" }],
      }));
    });

    await act(async () => {
      result.current.add();
    });

    expect(createMutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      initial_quantity: 0,
      initial_locations: undefined,
    }));
    expect(args.onError).not.toHaveBeenCalled();
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
