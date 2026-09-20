import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { BomUnmatchedRawsDrawer } from "../BomUnmatchedRawsDrawer";

function rawItem(overrides: Partial<Item> = {}): Item {
  return {
    item_id: "raw-1",
    item_name: "Raw material",
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
    mes_code: "RAW-001",
    model_symbol: null,
    model_slots: [],
    process_type_code: "TR",
    serial_no: null,
    bom_completed_at: null,
    bom_unmatched_status: null,
    deleted_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    department: null,
    ...overrides,
  };
}

function closestWithClass(element: HTMLElement, className: string): HTMLElement {
  let current: HTMLElement | null = element;
  while (current && !current.classList.contains(className)) current = current.parentElement;
  if (!current) throw new Error(`Missing ancestor with ${className}`);
  return current;
}

describe("BomUnmatchedRawsDrawer", () => {
  it("uses the opaque theme background when closed and for the expanded scrollable list", () => {
    const { container } = render(
      <BomUnmatchedRawsDrawer rawItems={[rawItem()]} childIdSet={new Set()} />,
    );

    const drawer = container.firstElementChild as HTMLDivElement;
    expect(drawer.style.background).toBe(LEGACY_COLORS.bg);
    expect(drawer).not.toHaveClass("border");
    expect(screen.getByRole("button")).toHaveClass("no-btn-inset");
    expect(screen.queryByText("Raw material")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button"));

    const list = closestWithClass(screen.getByText("Raw material"), "max-h-[30vh]");
    expect(list.style.background).toBe(LEGACY_COLORS.bg);
    expect(list).toHaveClass("max-h-[30vh]", "overflow-y-auto");
    expect(list.style.borderTop).toBe(`1px solid ${LEGACY_COLORS.border}`);
    expect(screen.getByText("Raw material").closest(".grid")?.style.borderBottom).toBe(`1px solid ${LEGACY_COLORS.border}`);
    expect(screen.getByText("RAW-001")).toBeInTheDocument();
  });

  it("keeps status-marked unmatched raws visible while showing the completed header state", () => {
    render(
      <BomUnmatchedRawsDrawer
        rawItems={[rawItem({ bom_unmatched_status: "HOLD" })]}
        childIdSet={new Set()}
        onStatusChange={vi.fn()}
      />,
    );

    expect(screen.getByText("처리 완료")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Raw material")).toBeInTheDocument();
  });

  it("reports mutually exclusive statuses and clears the current status when clicked again", () => {
    const onStatusChange = vi.fn();
    const { rerender } = render(
      <BomUnmatchedRawsDrawer rawItems={[rawItem()]} childIdSet={new Set()} onStatusChange={onStatusChange} />,
    );

    fireEvent.click(screen.getByRole("button"));
    const disused = screen.getByRole("checkbox", { name: "Raw material (RAW-001) 불용" });
    const row = screen.getByText("Raw material").closest(".grid");
    expect(row?.firstElementChild).toContainElement(disused);
    expect(disused).toHaveAttribute("aria-label", "Raw material (RAW-001) 불용");
    fireEvent.click(disused);
    expect(onStatusChange).toHaveBeenLastCalledWith("raw-1", "DISUSED");

    rerender(
      <BomUnmatchedRawsDrawer
        rawItems={[rawItem({ bom_unmatched_status: "DISUSED" })]}
        childIdSet={new Set()}
        onStatusChange={onStatusChange}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Raw material (RAW-001) 불용" }));
    expect(onStatusChange).toHaveBeenLastCalledWith("raw-1", null);
  });

  it("distinguishes same-name status controls with their MES code or item ID", () => {
    render(
      <BomUnmatchedRawsDrawer
        rawItems={[
          rawItem(),
          rawItem({ item_id: "raw-2", mes_code: null }),
        ]}
        childIdSet={new Set()}
        onStatusChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("checkbox", { name: "Raw material (RAW-001) 불용" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Raw material (raw-2) 불용" })).toBeInTheDocument();
  });
});
