import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";

vi.mock("../InventoryDetailPanel", () => ({
  InventoryDetailPanel: () => <div>상세 내용</div>,
}));

import { DesktopInventoryRightPanel } from "../DesktopInventoryRightPanel";

function makeItem(): Item {
  return {
    item_id: "item-1",
    item_name: "테스트 품목",
    mes_code: "46-AA-0080",
    spec: null,
    unit: "EA",
    quantity: 5,
    warehouse_qty: 5,
    min_stock: null,
    department: null,
    process_type: null,
    image_filename: null,
    locations: [],
  } as unknown as Item;
}

describe("DesktopInventoryRightPanel", () => {
  it("keeps modal dialog semantics while using one red card close button", () => {
    const onClose = vi.fn();
    const item = makeItem();
    render(
      <DesktopInventoryRightPanel
        selectedItem={item}
        displayItem={item}
        headerBadge={<span>정상</span>}
        onClose={onClose}
        onGoToWarehouse={() => {}}
      />,
    );

    const code = screen.getByText("46-AA-0080");
    expect(code.parentElement).toContainElement(screen.getByText("정상"));
    expect(screen.getByRole("dialog", { name: "테스트 품목" })).toHaveAttribute("aria-modal", "true");
    const closeButtons = screen.getAllByRole("button", { name: "패널 닫기" });
    expect(closeButtons).toHaveLength(1);
    expect(closeButtons[0]).toHaveStyle({
      background: `color-mix(in srgb, ${LEGACY_COLORS.red} 15%, transparent)`,
      color: LEGACY_COLORS.red,
    });

    fireEvent.click(closeButtons[0]);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
