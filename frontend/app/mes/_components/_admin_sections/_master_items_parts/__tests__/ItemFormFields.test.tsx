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
  it("places the MES code preview after the product block and shows selected symbols inline with its label", () => {
    render(
      <ItemFormFields
        form={baseForm({ model_slots: [1] })}
        setForm={vi.fn()}
        showMesCode
        productModels={[{ slot: 1, symbol: "A", model_name: "DX3000", is_reserved: false }]}
      />,
    );

    const productLabel = screen.getByText("사용 제품");
    const selectedSymbol = screen.getByText(/제품 기호:/);
    const codePreview = screen.getAllByText(/A-TR-/).find((element) => element.getAttribute("aria-readonly") === "true");

    expect(productLabel.parentElement).toContainElement(selectedSymbol);
    expect(productLabel.closest("div")?.parentElement?.compareDocumentPosition(codePreview!))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(codePreview?.parentElement?.nextElementSibling).toBeNull();
  });

  it("keeps the no-product guidance beneath the product chips", () => {
    render(
      <ItemFormFields
        form={baseForm()}
        setForm={vi.fn()}
        showMesCode
        productModels={[{ slot: 1, symbol: "A", model_name: "DX3000", is_reserved: false }]}
      />,
    );

    expect(screen.getByText(/사용 제품이 지정되지 않았습니다/)).toBeInTheDocument();
  });

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

  it("keeps the generated MES code preview without rendering the current prefix badge", () => {
    const { container } = render(
      <ItemFormFields
        form={baseForm({ model_slots: [1] })}
        setForm={vi.fn()}
        showMesCode
        productModels={[{ slot: 1, symbol: "A", model_name: "DX3000", is_reserved: false }]}
      />,
    );

    expect(screen.getAllByText(/A-TR-/).some((element) => element.getAttribute("aria-readonly") === "true")).toBe(true);
    expect(container.querySelector("strong")).not.toBeInTheDocument();
  });
});
