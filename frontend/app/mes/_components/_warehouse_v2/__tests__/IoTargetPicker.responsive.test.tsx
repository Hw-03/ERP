import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Item } from "../types";
import { IoTargetPicker } from "../IoTargetPicker";

vi.mock("../useItemOrderDrag", () => ({
  useItemOrderDrag: () => ({
    dragId: null,
    dropTargetId: null,
    makeHandlers: () => ({}),
  }),
}));

vi.mock("@/lib/queries/useMyItemOrderQuery", () => ({
  useMyItemOrderQuery: () => ({ data: null }),
  usePutMyItemOrderMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useResetMyItemOrderMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/app/mes/_components/login/useCurrentOperator", () => ({
  useCurrentOperator: () => ({ employee_id: "emp-1", assigned_model_slots: [] }),
}));

function makeItem(): Item {
  return {
    item_id: "item-1",
    item_name: "히팅 싱크 + 방열팬 (신형)",
    mes_code: "46-AA-0081",
    quantity: 0,
    warehouse_qty: 200,
    min_stock: null,
    locations: [],
    model_slots: [],
    deleted_at: null,
  } as unknown as Item;
}

const baseProps = {
  workType: "receive" as const,
  subType: "receive_supplier" as const,
  deptIoDirection: null,
  bundleSubType: null,
  bomParents: new Set<string>(),
  items: [makeItem()],
  productModels: [],
  bundles: [],
  search: "",
  onSearchChange: vi.fn(),
  onAddItem: vi.fn(),
  onRemoveBundles: vi.fn(),
  onAdvance: vi.fn(),
};

describe("IoTargetPicker responsive layout", () => {
  it("places the desktop fullscreen toggle over the table header and lets Escape exit", () => {
    const onFullscreenChange = vi.fn();
    const { container, rerender } = render(
      <IoTargetPicker {...baseProps} onFullscreenChange={onFullscreenChange} />,
    );

    const tableHeader = container.querySelector("thead")!;
    const enterButton = screen.getByRole("button", { name: "전체 화면" });
    expect(tableHeader.contains(enterButton)).toBe(true);

    fireEvent.click(enterButton);
    expect(onFullscreenChange).toHaveBeenLastCalledWith(true);

    rerender(<IoTargetPicker {...baseProps} fullscreen onFullscreenChange={onFullscreenChange} />);
    expect(screen.getByRole("button", { name: "전체 화면 해제" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onFullscreenChange).toHaveBeenLastCalledWith(false);
  });

  it("keeps fullscreen open when a picker control consumes Escape", async () => {
    const onFullscreenChange = vi.fn();
    render(<IoTargetPicker {...baseProps} fullscreen onFullscreenChange={onFullscreenChange} />);

    const departmentSelect = screen.getByRole("combobox", { name: "부서" });
    fireEvent.click(departmentSelect);
    await screen.findByRole("listbox");
    fireEvent.keyDown(departmentSelect, { key: "Escape" });

    expect(onFullscreenChange).not.toHaveBeenCalled();
    await waitFor(() => expect(departmentSelect).toHaveAttribute("aria-expanded", "false"));
  });

  it("keeps the picker search and table scroll position across a fullscreen prop change", () => {
    const onFullscreenChange = vi.fn();
    const { container, rerender } = render(
      <IoTargetPicker
        {...baseProps}
        search="히팅"
        onFullscreenChange={onFullscreenChange}
      />,
    );
    const tableViewport = container.querySelector<HTMLElement>("[data-keep-scroll]")!;
    tableViewport.scrollTop = 36;
    fireEvent.scroll(tableViewport);

    rerender(
      <IoTargetPicker
        {...baseProps}
        search="히팅"
        fullscreen
        onFullscreenChange={onFullscreenChange}
      />,
    );

    const currentTableViewport = container.querySelector<HTMLElement>("[data-keep-scroll]")!;
    expect(currentTableViewport).toBe(tableViewport);
    expect(currentTableViewport.scrollTop).toBe(36);
    expect(screen.getByRole("button", { name: "전체 화면 해제" })).toBeInTheDocument();
  });

  it("keeps the fullscreen exit button in the edit-order table header", () => {
    const onFullscreenChange = vi.fn();
    render(<IoTargetPicker {...baseProps} fullscreen onFullscreenChange={onFullscreenChange} />);

    fireEvent.click(screen.getByRole("button", { name: "순서 편집" }));

    fireEvent.click(screen.getByRole("button", { name: "전체 화면 해제" }));
    expect(onFullscreenChange).toHaveBeenLastCalledWith(false);
  });

  it("keeps edit-order state when the fullscreen prop changes", () => {
    const { rerender } = render(<IoTargetPicker {...baseProps} onFullscreenChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "순서 편집" }));
    expect(screen.getByRole("button", { name: "취소" })).toBeInTheDocument();

    rerender(<IoTargetPicker {...baseProps} fullscreen onFullscreenChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "취소" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "전체 화면 해제" })).toBeInTheDocument();
  });

  it("does not switch item table columns at the Tailwind sm breakpoint", () => {
    const { container } = render(<IoTargetPicker {...baseProps} />);
    const table = container.querySelector("table");

    expect(table).not.toBeNull();
    expect(table!.innerHTML).not.toContain("sm:");
    expect(table!.innerHTML).toContain("lg:");
  });

  it("keeps the add action column wide enough for BOM and single-item actions", () => {
    const { container } = render(<IoTargetPicker {...baseProps} />);
    const columns = container.querySelectorAll("table col");

    expect(columns[4]).toHaveStyle({ width: "128px" });
  });

  it("fixes internal-use source columns at the four-digit and action control width", () => {
    const { container } = render(
      <IoTargetPicker
        {...baseProps}
        workType="internal_use"
        subType="internal_use_out"
      />,
    );
    const headers = container.querySelectorAll("thead th");
    const columns = container.querySelectorAll("table col");
    const table = container.querySelector("table");

    expect(headers).toHaveLength(4);
    expect(screen.queryByRole("columnheader", { name: "추가" })).not.toBeInTheDocument();
    expect(columns).toHaveLength(4);
    expect(table).toHaveClass("lg:table-fixed");
    expect(columns[0]).toHaveClass("lg:w-auto");
    expect(columns[2]).toHaveClass("lg:w-32");
    expect(columns[3]).toHaveClass("lg:w-32");
  });

  it("shows mobile source chips under the item and opens actions in the tapped chip", () => {
    const onAddItem = vi.fn();
    render(
      <IoTargetPicker
        {...baseProps}
        workType="internal_use"
        subType="internal_use_out"
        bomParents={new Set(["item-1"])}
        onAddItem={onAddItem}
      />,
    );

    const warehouseChip = screen.getByRole("button", { name: "모바일 창고 수량 200" });
    expect(screen.getByRole("button", { name: "모바일 조립 수량 0" })).toBeInTheDocument();
    fireEvent.click(warehouseChip);

    expect(screen.queryByRole("button", { name: "모바일 창고 수량 200" })).not.toBeInTheDocument();
    const mobileBom = screen.getByRole("button", { name: "모바일 창고 BOM" });
    expect(mobileBom).toHaveClass("min-h-11", "flex-1");
    fireEvent.click(screen.getByRole("button", { name: "모바일 창고 낱개" }));
    expect(onAddItem).toHaveBeenCalledWith(
      expect.objectContaining({ item_id: "item-1" }),
      "manual",
      undefined,
      "warehouse",
    );
  });
});
