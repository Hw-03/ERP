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
      min_stock: "",
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
});
