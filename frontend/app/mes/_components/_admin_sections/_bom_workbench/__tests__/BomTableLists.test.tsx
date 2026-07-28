import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BOMDetailEntry, BOMEntry, Item } from "@/lib/api";
import { BomChildAddBox } from "../BomChildAddBox";
import { BomEditPanel } from "../BomEditPanel";
import { BomParentList } from "../BomParentList";
import { BOM_CURRENT_ROW_GRID_TEMPLATE, BOM_ROW_SURFACE_CLASS_NAME } from "../BomTablePrimitives";

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
  expect(header).toHaveStyle({ background: "var(--c-popup-bg)" });
  expect(container.querySelector("[role='rowgroup'], [role='columnheader']")).toBeNull();
}

function findTableRow(container: HTMLElement, gridTemplateColumns: string) {
  return [...container.querySelectorAll<HTMLElement>("button")].find(
    (element) => element.style.gridTemplateColumns === gridTemplateColumns,
  );
}

function setNameOverflow(element: HTMLElement, overflow: boolean) {
  Object.defineProperties(element, {
    clientWidth: { configurable: true, value: 120 },
    scrollWidth: { configurable: true, value: overflow ? 240 : 120 },
    clientHeight: { configurable: true, value: 20 },
    scrollHeight: { configurable: true, value: 20 },
  });
  fireEvent(window, new Event("resize"));
}

describe("BOM 편집 표형 목록", () => {
  it("상위 품목 목록에 선택 제목을 표시한다", () => {
    render(
      <BomParentList
        dept="A"
        items={[item()]}
        allBomRows={[]}
        completedSet={new Set()}
        statusFilter="ALL"
        selectedId=""
        onSelect={vi.fn()}
        mode="edit"
      />,
    );

    expect(screen.getByText("상위 품목 선택")).toBeInTheDocument();
  });

  it("상위 단계 필터를 건수와 함께 한 줄 compact 칩으로 정렬한다", () => {
    render(
      <BomParentList
        dept="A"
        items={[item()]}
        allBomRows={[]}
        completedSet={new Set()}
        statusFilter="ALL"
        selectedId=""
        onSelect={vi.fn()}
        mode="edit"
      />,
    );

    const count = screen.getByText("1건");
    const filterRow = count.parentElement;
    expect(filterRow).toHaveClass("flex-nowrap", "items-center", "gap-1.5");
    expect(count).toHaveClass("ml-auto");
    for (const button of within(filterRow!).getAllByRole("button")) {
      expect(button).toHaveClass("whitespace-nowrap", "px-2", "py-1", "text-xs");
    }
  });

  it("하위 품목 추가 제목 옆에 검색을 두고 후보 수를 노출하지 않는다", () => {
    render(
      <BomChildAddBox
        parent={item()}
        bomRows={[]}
        items={[item(), item({ item_id: "item-2", item_name: "추가 후보" })]}
        onAdd={vi.fn()}
      />,
    );

    const title = screen.getByText("하위 품목 추가");
    expect(title.parentElement).toContainElement(screen.getByRole("textbox"));
    expect(screen.queryByText("1개 후보")).not.toBeInTheDocument();
  });

  it("하위 후보를 단계 왼쪽·공정 오른쪽 필터의 교집합으로 표시한다", () => {
    render(
      <BomChildAddBox
        parent={item({ item_id: "parent" })}
        bomRows={[]}
        items={[
          item({ item_id: "tube-raw", item_name: "튜브 원자재", process_type_code: "TR" }),
          item({ item_id: "tube-wip", item_name: "튜브 중간공정", process_type_code: "TA" }),
          item({ item_id: "high-raw", item_name: "고압 원자재", process_type_code: "HR" }),
        ]}
        onAdd={vi.fn()}
      />,
    );

    const stageFilters = screen.getByRole("group", { name: "단계 필터" });
    const processFilters = screen.getByRole("group", { name: "공정 필터" });
    expect(stageFilters.compareDocumentPosition(processFilters)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(stageFilters).toHaveClass("gap-1.5");
    expect(processFilters).toHaveClass("gap-1.5", "border-l", "ml-1.5", "pl-3");
    expect(processFilters.parentElement).toHaveClass("shrink-0");
    expect(processFilters.parentElement).not.toHaveClass("ml-auto");
    expect(stageFilters.parentElement).toHaveClass("w-max", "min-w-full", "gap-1");
    expect(stageFilters.parentElement?.parentElement).toHaveClass("overflow-x-auto");
    for (const button of [
      ...within(stageFilters).getAllByRole("button"),
      ...within(processFilters).getAllByRole("button"),
    ]) {
      expect(button).toHaveClass("whitespace-nowrap", "px-2", "py-1", "text-xs");
    }
    expect(within(processFilters).getByRole("button", { name: "전체" })).toHaveAttribute("aria-pressed", "true");
    expect(within(processFilters).getByRole("button", { name: "튜브" })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(within(stageFilters).getByRole("button", { name: "원자재" }));
    fireEvent.click(within(processFilters).getByRole("button", { name: "튜브" }));

    expect(within(processFilters).getByRole("button", { name: "전체" })).toHaveAttribute("aria-pressed", "false");
    expect(within(processFilters).getByRole("button", { name: "튜브" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("튜브 원자재")).toBeInTheDocument();
    expect(screen.queryByText("튜브 중간공정")).not.toBeInTheDocument();
    expect(screen.queryByText("고압 원자재")).not.toBeInTheDocument();
  });

  it("parent and child searches ignore hyphens, dots, and slashes", () => {
    const searched = item({ item_name: "Search Item", mes_code: "6-AF/01.2" });
    const { rerender } = render(
      <BomParentList
        dept="A"
        items={[searched]}
        allBomRows={[]}
        completedSet={new Set()}
        statusFilter="ALL"
        selectedId=""
        onSelect={vi.fn()}
        mode="edit"
      />,
    );

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "6AF012" } });
    expect(screen.getByText("Search Item")).toBeInTheDocument();

    rerender(
      <BomChildAddBox parent={item({ item_id: "parent" })} bomRows={[]} items={[searched]} onAdd={vi.fn()} />,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "6AF012" } });
    expect(screen.getByText("Search Item")).toBeInTheDocument();
  });

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

    const gridTemplateColumns = "52px minmax(0, 1fr) 78px 44px";
    expectStickyTableHeader(container, gridTemplateColumns);
    const row = findTableRow(container, gridTemplateColumns);
    expect(row?.style.gridTemplateColumns).toBe(gridTemplateColumns);
    const header = [...container.querySelectorAll<HTMLElement>("div")].find(
      (element) => element.classList.contains("sticky") && element.style.gridTemplateColumns === gridTemplateColumns,
    );
    expect(header?.children.item(0)).toHaveClass("justify-self-center");
    expect(header?.children.item(3)).toHaveClass("justify-self-end");
    expect(row?.children.item(0)).toHaveClass("justify-self-center");
    expect(row?.children.item(3)).toHaveClass("justify-self-end");
    expect(row).toHaveClass("no-btn-inset", "px-3", "py-2", "hover:bg-[var(--c-s4)]");
    expect(row).toHaveClass("border-b");
    expect(row).not.toHaveClass("border-l-[3px]", "border-l-transparent");
    expect(row?.style.borderBottom).toBe("1px solid var(--c-border)");
    expect(row?.querySelector('[data-lucide="grip-vertical"]')).toBeNull();
    expect(row?.querySelector("[data-bom-row-label]")).not.toHaveAttribute("title");
    expect(row?.querySelector("[data-bom-row-code]")).not.toHaveAttribute("title");
    expect(row?.querySelector("button, [role='button'], [tabindex]")).toBeNull();
  });

  it("선택한 부모 행은 직원 목록처럼 파란 옅은 채움으로 구분하고 행 테두리를 두지 않는다", () => {
    const { container } = render(
      <BomParentList
        dept="A"
        items={[item()]}
        allBomRows={[detailRow]}
        completedSet={new Set()}
        statusFilter="ALL"
        selectedId="item-1"
        onSelect={vi.fn()}
        mode="edit"
      />,
    );

    const selectedRow = findTableRow(container, "52px minmax(0, 1fr) 78px 44px")!;
    expect(selectedRow).toHaveClass("border-b");
    expect(selectedRow).not.toHaveClass("border-l-[3px]", "border-l-[var(--c-blue)]");
    expect(selectedRow.style.background).toBe("color-mix(in srgb, var(--c-blue) 14%, transparent)");
    expect(selectedRow.style.borderBottom).toBe("1px solid var(--c-border)");
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

    const gridTemplateColumns = "52px minmax(0, 1fr) 78px 44px";
    expectStickyTableHeader(container, gridTemplateColumns);
    const row = findTableRow(container, gridTemplateColumns);
    expect(row?.style.gridTemplateColumns).toBe(gridTemplateColumns);
    expect(row?.children.item(3)).toHaveClass("justify-self-end");
    const candidateHeader = [...container.querySelectorAll<HTMLElement>("div")].find(
      (element) => element.classList.contains("sticky") && element.style.gridTemplateColumns === gridTemplateColumns,
    );
    expect(candidateHeader?.children.item(3)).toHaveClass("justify-self-end");
    expect(row).toHaveClass("px-3", "py-2", "hover:bg-[var(--c-s4)]");
    expect(row?.querySelector("[data-bom-row-label]")).not.toHaveAttribute("title");
    expect(row?.querySelector("[data-bom-row-code]")).not.toHaveAttribute("title");
    expect(row).not.toHaveStyle({ background: "transparent" });
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

    expect(BOM_CURRENT_ROW_GRID_TEMPLATE).toBe("52px minmax(0, 1fr) 78px 72px 28px");
    expectStickyTableHeader(container, BOM_CURRENT_ROW_GRID_TEMPLATE);
    expect(screen.getByText("CHILD-001")).toHaveClass("truncate");
    expect(screen.getByText("등록된 품목")).not.toHaveAttribute("title");
    const currentSurface = screen.getByText("등록된 품목").closest("[data-bom-row-surface]")!;
    expect(currentSurface).toHaveClass(...BOM_ROW_SURFACE_CLASS_NAME.split(" "));
    expect(currentSurface.style.gridTemplateColumns).toBe(BOM_CURRENT_ROW_GRID_TEMPLATE);
    expect(currentSurface.style.borderBottom).toBe("1px solid var(--c-border)");
    expect(currentSurface.children.item(3)).toHaveClass("justify-center");
    const currentHeader = [...container.querySelectorAll<HTMLElement>("div")].find(
      (element) => element.classList.contains("sticky") && element.style.gridTemplateColumns === BOM_CURRENT_ROW_GRID_TEMPLATE,
    );
    expect(currentHeader?.children.item(3)).toHaveClass("justify-self-center");
  });

  it("does not show the row tooltip while a current-row action is hovered or focused", () => {
    const { container } = render(
      <BomEditPanel
        parent={item()}
        bomRows={[bomRow]}
        items={[item(), item({ item_id: "item-2", item_name: "current child with a very long name" })]}
        onSaveQty={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    const surface = container.querySelector("[data-bom-row-surface]")!;
    setNameOverflow(surface.querySelector("[data-bom-row-label]")!, true);
    const quantityAction = surface.querySelector("button[title]")!;
    fireEvent.mouseEnter(surface.parentElement!);
    fireEvent.mouseEnter(quantityAction);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.focus(quantityAction);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(quantityAction).not.toHaveAttribute("aria-describedby");
  });

  it("does not describe a current-row action when focus begins on the action", () => {
    const { container } = render(
      <BomEditPanel
        parent={item()}
        bomRows={[bomRow]}
        items={[item(), item({ item_id: "item-2", item_name: "current child with a very long name" })]}
        onSaveQty={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    const surface = container.querySelector("[data-bom-row-surface]")!;
    setNameOverflow(surface.querySelector("[data-bom-row-label]")!, true);
    const quantityAction = surface.querySelector("button[title]")!;
    fireEvent.focus(quantityAction);

    expect(quantityAction).not.toHaveAttribute("aria-describedby");
  });

  it("restores the row tooltip after a quantity input loses focus", async () => {
    const { container } = render(
      <BomEditPanel
        parent={item()}
        bomRows={[bomRow]}
        items={[item(), item({ item_id: "item-2", item_name: "current child with a very long name" })]}
        onSaveQty={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    const surface = container.querySelector("[data-bom-row-surface]")!;
    setNameOverflow(surface.querySelector("[data-bom-row-label]")!, true);
    const quantityAction = surface.querySelector("button[title]")!;
    fireEvent.focus(quantityAction);
    fireEvent.click(quantityAction);
    const quantityInput = screen.getByRole("spinbutton");
    fireEvent.focus(quantityInput);
    fireEvent.blur(quantityInput);
    fireEvent.mouseEnter(surface.parentElement!);

    expect(await screen.findByRole("tooltip")).toHaveTextContent("current child with a very long name");
  });

  it("shows the full item name when a truncated current row is hovered", async () => {
    const { container } = render(
      <BomEditPanel
        parent={item()}
        bomRows={[bomRow]}
        items={[item(), item({ item_id: "item-2", item_name: "current child with a very long name" })]}
        onSaveQty={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    const surface = container.querySelector("[data-bom-row-surface]")!;
    setNameOverflow(surface.querySelector("[data-bom-row-label]")!, true);
    fireEvent.mouseEnter(surface.parentElement!);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("current child with a very long name");
  });

  it("shows the full item name when a truncated parent row is hovered", async () => {
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

    const row = findTableRow(container, "52px minmax(0, 1fr) 78px 44px")!;
    setNameOverflow(row.querySelector("[data-bom-row-label]")!, true);
    fireEvent.mouseEnter(row.parentElement!);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("아주 긴 이름의 BOM 품목입니다");
  });

  it("does not show a tooltip when the parent row name fits", () => {
    const { container } = render(
      <BomParentList
        dept="A"
        items={[item({ item_name: "short item" })]}
        allBomRows={[detailRow]}
        completedSet={new Set()}
        statusFilter="ALL"
        selectedId=""
        onSelect={vi.fn()}
        mode="edit"
      />,
    );

    const row = findTableRow(container, "52px minmax(0, 1fr) 78px 44px")!;
    setNameOverflow(row.querySelector("[data-bom-row-label]")!, false);
    fireEvent.mouseEnter(row.parentElement!);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
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
