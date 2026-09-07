import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AddItemForm } from "../AddItemForm";

const setAddForm = vi.fn();

vi.mock("../../AdminMasterItemsContext", () => ({
  useAdminMasterItemsContext: () => ({
    setAddMode: vi.fn(),
    addForm: {
      item_name: "",
      process_type_code: "TR",
      unit: "EA",
      model_slots: [],
      sales_review_required: false,
      legacy_item_type: "",
      supplier: "",
      supplier_item_code: "",
      standard_purchase_price: "",
      purchase_price_effective_date: "",
      min_stock: "",
      reorder_point: "",
      procurement_lead_time_days: "",
      minimum_order_quantity: "",
      initial_quantity: "",
      initial_locations: [],
    },
    setAddForm,
    addItem: vi.fn(),
    productModels: [],
  }),
}));

vi.mock("../../../DepartmentsContext", () => ({
  useDepartments: () => [],
}));

describe("AddItemForm", () => {
  it("does not render a duplicate heading or the obsolete item-code hint", () => {
    render(<AddItemForm />);

    expect(screen.queryByText("새 품목 추가")).not.toBeInTheDocument();
    expect(screen.queryByText(/품번은 카테고리 기반으로 자동 부여됩니다/)).not.toBeInTheDocument();
  });

  it("selecting AF defaults sales review to required", () => {
    render(<AddItemForm />);

    fireEvent.click(screen.getAllByRole("combobox")[0]);
    fireEvent.mouseDown(screen.getByRole("option", { name: "AF — 조립 공정완료" }));

    const updater = setAddForm.mock.calls[0][0] as (form: {
      process_type_code: string;
      sales_review_required: boolean;
    }) => { process_type_code: string; sales_review_required: boolean };
    expect(updater({ process_type_code: "TR", sales_review_required: false })).toEqual({
      process_type_code: "AF",
      sales_review_required: true,
    });
  });

  it("새 품목 폼에 선택 가능한 구매·재고 발주 기준 전체를 포함한다", () => {
    render(<AddItemForm />);

    for (const label of ["주 공급사", "공급사 품번", "기준 매입단가", "단가 기준일", "안전재고", "발주점", "조달 리드타임", "최소 발주수량(MOQ)"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });
});
