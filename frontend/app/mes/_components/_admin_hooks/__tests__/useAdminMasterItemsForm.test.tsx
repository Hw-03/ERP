import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { queryKeys } from "@/lib/queries/keys";

const updateItemMock = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    updateItem: (...a: any[]) => updateItemMock(...a),
  },
}));

import { useAdminMasterItemsForm } from "../useAdminMasterItemsForm";

function makeClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function renderFormHook(
  args: Parameters<typeof useAdminMasterItemsForm>[0],
  client = makeClient(),
) {
  return renderHook(() => useAdminMasterItemsForm(args), { wrapper: makeWrapper(client) });
}

const I = (over: Partial<any> = {}): any => ({
  item_id: "1",
  item_name: "프로브",
  mes_code: "P-001",
  process_type_code: "TR",
  unit: "EA",
  model_slots: [],
  bom_stock_exempt: false,
  sales_review_required: false,
  ...over,
});

const baseArgs = (over: Partial<Parameters<typeof useAdminMasterItemsForm>[0]> = {}) => ({
  selectedItem: null,
  setSelectedItem: vi.fn(),
  setItems: vi.fn(),
  onStatusChange: vi.fn(),
  onError: vi.fn(),
  ...over,
});

describe("useAdminMasterItemsForm", () => {
  beforeEach(() => {
    updateItemMock.mockReset();
  });

  it("selectedItem null → 빈 form, dirty=false", () => {
    const { result } = renderFormHook(baseArgs());
    expect(result.current.form.item_name).toBe("");
    expect(result.current.dirty).toBe(false);
  });

  it("selectedItem 주어지면 form 자동 채워짐, dirty=false", () => {
    const item = I({
      bom_stock_exempt: true,
      sales_review_required: true,
      supplier_item_code: "SUP-1",
      standard_purchase_price: "1234.50",
      purchase_price_effective_date: "2026-09-01",
      min_stock: 10,
      reorder_point: 20,
      procurement_lead_time_days: 7,
      minimum_order_quantity: 30,
      purchase_memo: "납기 전 연락",
    });
    const { result } = renderFormHook(baseArgs({ selectedItem: item }));
    expect(result.current.form.item_name).toBe("프로브");
    expect(result.current.form.mes_code).toBe("P-001");
    expect(result.current.form.bom_stock_exempt).toBe(true);
    expect(result.current.form.sales_review_required).toBe(true);
    expect(result.current.form.supplier_item_code).toBe("SUP-1");
    expect(result.current.form.standard_purchase_price).toBe("1234.50");
    expect(result.current.form.minimum_order_quantity).toBe("30");
    expect(result.current.form.purchase_memo).toBe("납기 전 연락");
    expect(result.current.dirty).toBe(false);
  });

  it("save는 공백 nullable 구매·재고 기준을 명시적 null로 보내고 텍스트를 정리한다", async () => {
    const updated = I({ item_name: "변경됨" });
    updateItemMock.mockResolvedValue(updated);
    const { result } = renderFormHook(baseArgs({ selectedItem: I() }));
    act(() => {
      result.current.setForm((form) => ({
        ...form,
        supplier: "  공급사  ",
        supplier_item_code: "  ",
        standard_purchase_price: "",
        purchase_price_effective_date: "",
        min_stock: "",
        reorder_point: "",
        procurement_lead_time_days: "",
        minimum_order_quantity: "",
        purchase_memo: "   ",
      }));
    });

    await act(async () => { await result.current.save(); });

    expect(updateItemMock).toHaveBeenCalledWith("1", expect.objectContaining({
      supplier: "공급사",
      supplier_item_code: null,
      standard_purchase_price: null,
      purchase_price_effective_date: null,
      min_stock: null,
      reorder_point: null,
      procurement_lead_time_days: null,
      minimum_order_quantity: null,
      purchase_memo: null,
    }));
  });

  it("MOQ가 1 미만이면 수정 API를 호출하지 않는다", async () => {
    const args = baseArgs({ selectedItem: I() });
    const { result } = renderFormHook(args);
    act(() => {
      result.current.setForm((form) => ({ ...form, minimum_order_quantity: "0" }));
    });

    await act(async () => { await result.current.save(); });

    expect(args.onError).toHaveBeenCalledWith("최소 발주수량(MOQ)은 1 이상 입력하세요.");
    expect(updateItemMock).not.toHaveBeenCalled();
  });

  it.each([
    ["min_stock", "-1", "안전재고는 0 이상 입력하세요."],
    ["reorder_point", "-1", "발주점은 0 이상 입력하세요."],
    ["procurement_lead_time_days", "-1", "조달 리드타임은 0 이상 입력하세요."],
  ] as const)("%s가 음수이면 수정 API를 호출하지 않는다", async (field, value, errorMessage) => {
    const args = baseArgs({ selectedItem: I() });
    const { result } = renderFormHook(args);
    act(() => {
      result.current.setForm((form) => ({ ...form, [field]: value }));
    });

    await act(async () => { await result.current.save(); });

    expect(args.onError).toHaveBeenCalledWith(errorMessage);
    expect(updateItemMock).not.toHaveBeenCalled();
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
  ] as const)("%s의 잘못된 정수값 %s이면 수정 API를 호출하지 않는다", async (field, value, errorMessage) => {
    const args = baseArgs({ selectedItem: I() });
    const { result } = renderFormHook(args);
    act(() => {
      result.current.setForm((form) => ({ ...form, [field]: value }));
    });

    await act(async () => { await result.current.save(); });

    expect(args.onError).toHaveBeenCalledWith(errorMessage);
    expect(updateItemMock).not.toHaveBeenCalled();
  });

  it.each(["abc", "-1", "1.234", "   "])("잘못된 기준 매입단가 %j이면 수정 API를 호출하지 않는다", async (standardPurchasePrice) => {
    const args = baseArgs({ selectedItem: I() });
    const { result } = renderFormHook(args);
    act(() => {
      result.current.setForm((form) => ({ ...form, standard_purchase_price: standardPurchasePrice }));
    });

    await act(async () => { await result.current.save(); });

    expect(args.onError).toHaveBeenCalledWith("기준 매입단가는 0 이상, 소수점 둘째 자리까지 입력하세요.");
    expect(updateItemMock).not.toHaveBeenCalled();
  });

  it("유효한 기준 매입단가는 공백을 제거한 문자열로 수정 payload에 보존한다", async () => {
    const updated = I({ item_name: "변경됨" });
    updateItemMock.mockResolvedValue(updated);
    const { result } = renderFormHook(baseArgs({ selectedItem: I() }));
    act(() => {
      result.current.setForm((form) => ({ ...form, standard_purchase_price: " 123.45 " }));
    });

    await act(async () => { await result.current.save(); });

    expect(updateItemMock).toHaveBeenCalledWith("1", expect.objectContaining({ standard_purchase_price: "123.45" }));
  });

  it("setForm 호출 시 dirty=true", () => {
    const { result } = renderFormHook(baseArgs({ selectedItem: I() }));
    act(() => {
      result.current.setForm((f) => ({
        ...f,
        item_name: "변경됨",
        bom_stock_exempt: true,
        sales_review_required: true,
      }));
    });
    expect(result.current.dirty).toBe(true);
  });

  it("save — selectedItem 없으면 updateItem 호출 안 함", async () => {
    const { result } = renderFormHook(baseArgs());
    await act(async () => {
      await result.current.save();
    });
    expect(updateItemMock).not.toHaveBeenCalled();
  });

  it("save — 성공 시 setItems/setSelectedItem 호출 + dirty=false", async () => {
    const updated = I({ item_name: "변경됨" });
    updateItemMock.mockResolvedValue(updated);
    const args = baseArgs({ selectedItem: I() });
    const { result } = renderFormHook(args);
    act(() => {
      result.current.setForm((f) => ({
        ...f,
        item_name: "변경됨",
        bom_stock_exempt: true,
        sales_review_required: true,
      }));
    });
    expect(result.current.dirty).toBe(true);
    await act(async () => {
      await result.current.save();
    });
    await waitFor(() => expect(result.current.dirty).toBe(false));
    expect(args.setItems).toHaveBeenCalled();
    expect(args.setSelectedItem).toHaveBeenCalledWith(updated);
    expect(updateItemMock).toHaveBeenCalledWith("1", expect.objectContaining({
      bom_stock_exempt: true,
      sales_review_required: true,
    }));
  });

  it("save 성공 후 shared items query root를 무효화한다", async () => {
    const updated = I({ item_name: "Changed" });
    updateItemMock.mockResolvedValue(updated);
    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    const { result } = renderFormHook(baseArgs({ selectedItem: I() }), client);

    await act(async () => {
      await result.current.save();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.items.all });
  });
});
