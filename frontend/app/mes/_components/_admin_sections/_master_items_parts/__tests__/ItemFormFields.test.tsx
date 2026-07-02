import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ItemFormFields, type ItemFormData } from "../ItemFormFields";

vi.mock("../../../DepartmentsContext", () => ({
  useDepartments: () => [{ name: "조립" }, { name: "튜브" }],
}));

function baseForm(overrides: Partial<ItemFormData> = {}): ItemFormData {
  return {
    item_name: "테스트 품목",
    legacy_item_type: "",
    supplier: "",
    min_stock: "",
    process_type_code: "TR",
    unit: "EA",
    model_slots: [],
    initial_locations: [],
    ...overrides,
  };
}

describe("ItemFormFields", () => {
  it("offers warehouse as an initial stock location", () => {
    const setForm = vi.fn();
    render(
      <ItemFormFields
        form={baseForm({ initial_locations: [{ department: "창고", quantity: "5" }] })}
        setForm={setForm}
        showInitialLocations
      />,
    );

    const locationSelect = screen.getAllByRole("combobox")[0];
    fireEvent.click(locationSelect);

    expect(screen.getByRole("option", { name: "창고" })).toBeInTheDocument();
  });

  it("uses a controlled dropdown for material classification and preserves legacy values", () => {
    render(
      <ItemFormFields
        form={baseForm({ legacy_item_type: "필라멘트" })}
        setForm={vi.fn()}
      />,
    );

    const materialSelect = screen.getByRole("combobox", { name: "자재분류" });
    expect(within(materialSelect).getByText("현재값: 필라멘트")).toBeInTheDocument();

    fireEvent.click(materialSelect);
    expect(screen.getByRole("option", { name: "원자재" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "부자재" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "불용" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "기타" })).toBeInTheDocument();
  });
});
