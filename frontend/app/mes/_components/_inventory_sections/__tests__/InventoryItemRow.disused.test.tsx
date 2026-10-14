import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Item } from "@/lib/api";

vi.mock("@/app/mes/_components/DepartmentsContext", () => ({
  useDeptColorLookup: () => () => "var(--c-blue)",
}));

import { InventoryItemRow } from "../InventoryItemRow";

function makeItem(quantity: number, legacyItemType: string | null): Item {
  return {
    item_id: "disused-item",
    item_name: "불용 테스트 품목",
    mes_code: "3-TR-0001",
    quantity,
    available_quantity: quantity,
    warehouse_qty: quantity,
    min_stock: 10,
    legacy_item_type: legacyItemType,
    locations: [],
  } as unknown as Item;
}

describe.each([false, true])("InventoryItemRow disused badge (compact=%s)", (compact) => {
  it.each([0, 5, 15])("shows a neutral archived badge regardless of quantity %s", (quantity) => {
    render(<table><tbody><InventoryItemRow item={makeItem(quantity, "불용")} selected={false} compact={compact} onSelect={vi.fn()} /></tbody></table>);

    const badge = screen.getByText("불용");
    expect(badge).toHaveStyle({ color: "var(--c-muted2)" });
    expect(badge).toHaveClass("rounded-full", "inline-flex");
    expect(badge.querySelector("svg")).toHaveClass("lucide-archive");
    expect(screen.queryByText(/^(품절|부족|정상)$/)).not.toBeInTheDocument();
    expect(screen.getByTestId("inventory-total-stock")).toHaveTextContent(String(quantity));
  });

  it.each([
    [0, "품절", "lucide-circle-x"],
    [5, "부족", "lucide-triangle-alert"],
    [15, "정상", "lucide-circle-check"],
  ])("keeps regular stock status at quantity %s", (quantity, label, iconClass) => {
    render(<table><tbody><InventoryItemRow item={makeItem(quantity as number, null)} selected={false} compact={compact} onSelect={vi.fn()} /></tbody></table>);

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText(label).querySelector("svg")).toHaveClass(iconClass);
    expect(screen.queryByText("불용")).not.toBeInTheDocument();
  });
});
