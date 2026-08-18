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
    sales_review_required: false,
    initial_locations: [],
    ...overrides,
  };
}

describe("ItemFormFields", () => {
  it("기본 정보 필드를 업무 입력 순서로 렌더링한다", () => {
    render(
      <ItemFormFields
        form={baseForm({ model_slots: [1] })}
        setForm={vi.fn()}
        showMesCode
        productModels={[{ slot: 1, symbol: "A", model_name: "DX3000", is_reserved: false }]}
      />,
    );

    const labels = ["품목명", "카테고리", "사용 제품", "자재분류", "안전재고", "공급사", "단위", "품목 코드"]
      .map((label) => screen.getByText(label, { selector: "div" }));

    for (let index = 0; index < labels.length - 1; index += 1) {
      expect(labels[index].compareDocumentPosition(labels[index + 1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("places the sales-review checkbox directly after the MES code preview", () => {
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
    const checkbox = screen.getByRole("checkbox", { name: "영업 확인 필요" });

    expect(productLabel.parentElement).toContainElement(selectedSymbol);
    expect(productLabel.closest("div")?.parentElement?.compareDocumentPosition(codePreview!))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(codePreview?.parentElement?.nextElementSibling).toBe(checkbox.closest("label"));
  });

  it("does not render redundant no-product guidance beneath the product chips", () => {
    render(
      <ItemFormFields
        form={baseForm()}
        setForm={vi.fn()}
        showMesCode
        productModels={[{ slot: 1, symbol: "A", model_name: "DX3000", is_reserved: false }]}
      />,
    );

    expect(screen.queryByText(/사용 제품이 지정되지 않았습니다/)).not.toBeInTheDocument();
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

    const locationSelect = screen.getByRole("combobox", { name: "초기 재고 위치" });
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

  it("모델 칩과 품목코드 미리보기를 제품기호 오름차순으로 표시한다", () => {
    render(
      <ItemFormFields
        form={baseForm({
          model_slots: [1, 3, 4],
          mes_code: "348-AR-0723",
          process_type_code: "AR",
        })}
        setForm={vi.fn()}
        showMesCode
        productModels={[
          { slot: 1, symbol: "3", model_name: "DX3000", is_reserved: false },
          { slot: 3, symbol: "8", model_name: "SOLO", is_reserved: false },
          { slot: 4, symbol: "4", model_name: "ADX4000W", is_reserved: false },
        ]}
      />,
    );

    expect(screen.getByText("348-AR-0723", { selector: "[aria-readonly]" })).toBeInTheDocument();

    const dx3000 = screen.getByRole("button", { name: "DX3000 (3)" });
    const adx4000w = screen.getByRole("button", { name: "ADX4000W (4)" });
    const solo = screen.getByRole("button", { name: "SOLO (8)" });

    expect(dx3000.compareDocumentPosition(adx4000w) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(adx4000w.compareDocumentPosition(solo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders a semantic sales-review checkbox with guidance", () => {
    const setForm = vi.fn();
    render(<ItemFormFields form={baseForm()} setForm={setForm} />);

    const checkbox = screen.getByRole("checkbox", { name: "영업 확인 필요" });
    expect(checkbox).not.toBeChecked();
    expect(screen.getByText(/출하 요청 작성 시 강조/)).toBeInTheDocument();

    fireEvent.click(checkbox);
    const updater = setForm.mock.calls[0][0] as (form: ItemFormData) => ItemFormData;
    expect(updater(baseForm()).sales_review_required).toBe(true);
  });

  it("renders a BOM stock-exemption checkbox while keeping manual adjustments available", () => {
    const setForm = vi.fn();
    render(<ItemFormFields form={baseForm()} setForm={setForm} />);

    const checkbox = screen.getByRole("checkbox", { name: "BOM 재고 미반영" });
    expect(checkbox).not.toBeChecked();
    expect(screen.getByText(/수동 입출고와 수량 조정은 가능합니다/)).toBeInTheDocument();

    fireEvent.click(checkbox);
    const updater = setForm.mock.calls[0][0] as (form: ItemFormData) => ItemFormData;
    expect((updater(baseForm()) as ItemFormData & { bom_stock_exempt?: boolean }).bom_stock_exempt).toBe(true);
  });

  it("left-aligns the minimum-stock quantity input", () => {
    render(<ItemFormFields form={baseForm()} setForm={vi.fn()} />);

    expect(screen.getByRole("spinbutton")).toHaveClass("!text-left");
  });

  it("marks material classification and minimum stock as optional outside item registration", () => {
    render(<ItemFormFields form={baseForm()} setForm={vi.fn()} />);

    expect(screen.getByText("자재분류", { selector: "div" }).parentElement).toHaveTextContent("선택");
    expect(screen.getByText("안전재고", { selector: "div" }).parentElement).toHaveTextContent("선택");
  });

  it("marks product selection and initial stock location as required with centered badges", () => {
    render(
      <ItemFormFields
        form={baseForm()}
        setForm={vi.fn()}
        showInitialLocations
        productModels={[{ slot: 1, symbol: "3", model_name: "DX3000", is_reserved: false }]}
      />,
    );

    expect(screen.getByText("사용 제품", { selector: "div" }).parentElement).toHaveTextContent("필수");
    expect(screen.getByText("초기 재고 위치", { selector: "div" }).parentElement).toHaveTextContent("필수");
    expect(screen.getByText("자재분류", { selector: "div" }).parentElement).toHaveTextContent("선택");
    expect(screen.getByText("안전재고", { selector: "div" }).parentElement).toHaveTextContent("선택");
    for (const badge of screen.getAllByText("필수", { selector: "span" })) {
      expect(badge).toHaveClass("inline-flex", "items-center", "justify-center", "text-center");
    }
  });

  it("places material classification and minimum stock in an even two-column row", () => {
    render(<ItemFormFields form={baseForm()} setForm={vi.fn()} />);

    const materialField = screen.getByText("자재분류", { selector: "div" }).parentElement;
    const stockField = screen.getByText("안전재고", { selector: "div" }).parentElement;
    const pairRow = materialField?.parentElement;

    expect(pairRow).toHaveClass("grid", "sm:grid-cols-2", "gap-4");
    expect(pairRow).toContainElement(stockField);
  });

  it("places supplier and unit in an even two-column row", () => {
    render(<ItemFormFields form={baseForm()} setForm={vi.fn()} />);

    const supplierField = screen.getByText("공급사", { selector: "div" }).parentElement;
    const unitField = screen.getByText("단위", { selector: "div" }).parentElement;
    const pairRow = supplierField?.parentElement;

    expect(pairRow).toHaveClass("grid", "sm:grid-cols-2", "gap-4");
    expect(pairRow).toContainElement(unitField);
  });
});
