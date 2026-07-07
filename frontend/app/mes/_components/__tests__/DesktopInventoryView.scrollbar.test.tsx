import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DesktopInventoryView } from "../DesktopInventoryView";

vi.mock("@/lib/queries/useModelsQuery", () => ({
  useModelsQuery: () => ({ data: [] }),
}));

vi.mock("../_hooks/useInventoryData", () => ({
  useInventoryData: () => ({
    items: [],
    setItems: vi.fn(),
    loading: false,
    error: null,
    loadItems: vi.fn(),
  }),
}));

vi.mock("../_hooks/useItemImageManifest", () => ({
  useItemImageManifest: () => ({}),
}));

vi.mock("../_hooks/useDesktopInventoryDerivations", () => ({
  useDesktopInventoryDerivations: () => ({
    isFiltered: false,
    activeFilterCount: 0,
    kpiCards: [],
    headerBadge: null,
  }),
}));

vi.mock("../_inventory_sections/InventoryKpiPanel", () => ({
  InventoryKpiPanel: () => <div data-testid="inventory-kpi-panel" />,
}));

vi.mock("../_inventory_sections/InventoryCapacityPanel", () => ({
  InventoryCapacityPanel: () => <div data-testid="inventory-capacity-panel" />,
}));

vi.mock("../_inventory_sections/InventoryFilterToggleButton", () => ({
  InventoryFilterToggleButton: () => <button type="button">필터</button>,
}));

vi.mock("../_inventory_sections/InventoryFilterBar", () => ({
  InventoryFilters: () => <div data-testid="inventory-filters" />,
  InventoryTableStickyHeader: () => <div data-testid="inventory-table-header" />,
}));

vi.mock("../_inventory_sections/InventoryItemsTable", () => ({
  InventoryItemsTable: () => <div data-testid="inventory-items-table" />,
}));

vi.mock("../_inventory_sections/DesktopInventoryRightPanel", () => ({
  DesktopInventoryRightPanel: () => <aside data-testid="inventory-right-panel" />,
}));

describe("DesktopInventoryView scrollbar", () => {
  it("keeps the dashboard material list scrollbar visible and draggable", () => {
    const { container } = render(
      <DesktopInventoryView
        globalSearch=""
        onStatusChange={vi.fn()}
        onGoToWarehouse={vi.fn()}
      />,
    );

    const scroller = container.querySelector(".overflow-y-auto");

    expect(scroller).not.toBeNull();
    expect(scroller).not.toHaveClass("scrollbar-hide");
    expect(scroller).toHaveClass("sg");
  });
});
