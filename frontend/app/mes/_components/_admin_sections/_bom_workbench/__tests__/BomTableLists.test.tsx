import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BOMDetailEntry, BOMEntry, Item } from "@/lib/api";
import { BomChildAddBox } from "../BomChildAddBox";
import { BomEditPanel } from "../BomEditPanel";
import { BomParentList } from "../BomParentList";

function item(overrides: Partial<Item> = {}): Item {
  return {
    item_id: "item-1",
    item_name: "아주 긴 이름의 BOM 품목입니다",
    unit: "EA",
    quantity: 0,
    warehouse_qty: 0,
    production_total: 0,
    defective_total: 0,
    pending_quantity: 0,
    available_quantity: 0,
    last_reserver_name: null,
    location: null,
    locations: [],
    legacy_part: null,
    legacy_item_type: null,
    supplier: null,
    min_stock: null,
    mes_code: "BOM-001",
    model_symbol: null,
    model_slots: [],
    process_type_code: "AA",
    serial_no: null,
    bom_completed_at: null,
    deleted_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    department: null,
    ...overrides,
  };
}

const detailRow: BOMDetailEntry = {
  bom_id: "bom-1",
  parent_item_id: "item-1",
  parent_item_name: "부모 품목",
  parent_mes_code: "PARENT-001",
  child_item_id: "item-2",
  child_item_name: "자식 품목",
  child_mes_code: "CHILD-001",
  quantity: 1,
  unit: "EA",
};

const bomRow: BOMEntry = {
  bom_id: "bom-1",
  parent_item_id: "item-1",
  child_item_id: "item-2",
  quantity: 2,
  unit: "EA",
  notes: null,
};

function expectStickyTableHeader(container: HTMLElement, gridTemplateColumns: string) {
  const header = [...container.querySelectorAll<HTMLElement>("div")].find((element) =>
    element.classList.contains("sticky") && element.style.gridTemplateColumns === gridTemplateColumns,
  );
  expect(header).toHaveClass("sticky", "top-0");
  expect(header?.style.gridTemplateColumns).toBe(gridTemplateColumns);
  expect(container.querySelector("[role='rowgroup'], [role='columnheader']")).toBeNull();
}

function findTableRow(container: HTMLElement, gridTemplateColumns: string) {
  return [...container.querySelectorAll<HTMLElement>("button")].find(
    (element) => element.style.gridTemplateColumns === gridTemplateColumns,
  );
}

describe("BOM 편집 표형 목록", () => {
  it("부모 목록을 공정·품목명·품목 코드·상태 열의 sticky 표로 표시한다", () => {
    const { container } = render(
      <BomParentList
        dept="A"
        items={[item()]}
        allBomRows={[detailRow]}
        completedSet={new Set()}
        statusFilter="ALL"
        selectedId=""
        onSelect={vi.fn()}
        mode="edit"
      />,
    );

    const gridTemplateColumns = "52px minmax(0, 1fr) minmax(0, 0.82fr) 72px";
    expectStickyTableHeader(container, gridTemplateColumns);
    const row = findTableRow(container, gridTemplateColumns);
    expect(row?.style.gridTemplateColumns).toBe(gridTemplateColumns);
    expect(row?.children.item(3)).toHaveClass("justify-self-end");
    expect(row?.querySelector("[data-bom-row-label]")).toHaveAttribute("title", "아주 긴 이름의 BOM 품목입니다");
    expect(row?.querySelector("[title='BOM-001']")).toBeInTheDocument();
    expect(row?.querySelector("button, [role='button'], [tabindex]")).toBeNull();
  });

  it("하위 품목 추가 목록을 공정·품목명·품목 코드·추가 열의 sticky 표로 표시한다", () => {
    const { container } = render(
      <BomChildAddBox
        parent={item()}
        bomRows={[]}
        items={[item(), item({ item_id: "item-2", item_name: "추가할 품목", mes_code: "CHILD-001" })]}
        onAdd={vi.fn().mockResolvedValue(true)}
      />,
    );

    const gridTemplateColumns = "52px minmax(0, 1fr) minmax(0, 0.82fr) 72px";
    expectStickyTableHeader(container, gridTemplateColumns);
    const row = findTableRow(container, gridTemplateColumns);
    expect(row?.style.gridTemplateColumns).toBe(gridTemplateColumns);
    expect(row?.children.item(3)).toHaveClass("justify-self-end");
    expect(row?.querySelector("[data-bom-row-label]")).toHaveAttribute("title", "추가할 품목");
    expect(row?.querySelector("[title='CHILD-001']")).toBeInTheDocument();
  });

  it("현재 구성 목록을 공정·품목명·품목 코드·수량·삭제 열의 sticky 표로 표시한다", () => {
    const { container } = render(
      <BomEditPanel
        parent={item()}
        bomRows={[bomRow]}
        items={[item(), item({ item_id: "item-2", item_name: "등록된 품목", mes_code: "CHILD-001" })]}
        onSaveQty={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    expectStickyTableHeader(container, "52px minmax(0, 1fr) minmax(0, 0.82fr) 140px 40px");
    expect(screen.getByText("CHILD-001")).toHaveClass("truncate");
  });

  it("추가 후보의 중복 비활성화와 Escape 수량 입력 취소를 유지한다", () => {
    render(
      <BomChildAddBox
        parent={item()}
        bomRows={[bomRow]}
        items={[
          item(),
          item({ item_id: "item-2", item_name: "이미 등록된 품목", mes_code: "CHILD-001" }),
          item({ item_id: "item-3", item_name: "추가할 품목", mes_code: "CHILD-002" }),
        ]}
        onAdd={vi.fn().mockResolvedValue(true)}
      />,
    );

    expect(screen.getByText("등록됨").closest("button")).toBeDisabled();

    fireEvent.click(screen.getByText("추가할 품목").closest("button")!);
    const quantity = screen.getByRole("spinbutton");
    fireEvent.keyDown(quantity, { key: "Escape" });

    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });

  it("현재 구성의 수량 Enter 저장·Escape 취소와 삭제 요청을 유지한다", () => {
    const onSaveQty = vi.fn();
    const onRequestDelete = vi.fn();
    render(
      <BomEditPanel
        parent={item()}
        bomRows={[bomRow]}
        items={[item(), item({ item_id: "item-2", item_name: "등록된 품목", mes_code: "CHILD-001" })]}
        onSaveQty={onSaveQty}
        onRequestDelete={onRequestDelete}
      />,
    );

    fireEvent.click(screen.getByTitle("클릭하여 수량 수정"));
    const quantity = screen.getByRole("spinbutton");
    fireEvent.change(quantity, { target: { value: "3" } });
    fireEvent.keyDown(quantity, { key: "Enter" });
    expect(onSaveQty).toHaveBeenCalledWith("bom-1", 3);

    fireEvent.click(screen.getByTitle("클릭하여 수량 수정"));
    fireEvent.keyDown(screen.getByRole("spinbutton"), { key: "Escape" });
    expect(onSaveQty).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTitle("삭제"));
    expect(onRequestDelete).toHaveBeenCalledWith(bomRow, "등록된 품목");
  });
});
