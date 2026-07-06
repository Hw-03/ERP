import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileDashboardScreen } from "../MobileDashboardScreen";

vi.mock("../../../_hooks/useInventoryData", () => ({
  useInventoryData: () => ({
    items: [
      {
        item_id: "item-1",
        item_name: "테스트 품목",
        quantity: 10,
        warehouse_qty: 10,
        locations: [],
        model_slots: [],
      },
    ],
    loading: false,
    error: null,
    loadItems: vi.fn(),
  }),
}));

vi.mock("../../../_hooks/useItemImageManifest", () => ({
  useItemImageManifest: () => ({}),
}));

vi.mock("@/lib/queries/useModelsQuery", () => ({
  useModelsQuery: () => ({ data: [] }),
}));

vi.mock("../../../_hooks/useDesktopInventoryDerivations", () => ({
  useDesktopInventoryDerivations: () => ({
    isFiltered: false,
    activeFilterCount: 0,
    kpiCards: [],
    headerBadge: null,
  }),
}));

vi.mock("../../../_inventory_sections/InventoryKpiPanel", () => ({
  InventoryKpiPanel: () => <div data-testid="kpi-panel">전체 1</div>,
}));

vi.mock("../../../_inventory_sections/InventoryCapacityPanel", () => ({
  InventoryCapacityPanel: () => null,
  capacityStatusBadge: () => null,
}));

vi.mock("../../../_inventory_sections/InventoryFilterBar", () => ({
  InventoryFilters: () => null,
}));

vi.mock("../../../_inventory_sections/InventoryItemsTable", () => ({
  InventoryItemsTable: () => <div data-testid="inventory-table" />,
}));

vi.mock("../../../_inventory_sections/InventoryDetailPanel", () => ({
  InventoryDetailPanel: () => null,
}));

describe("MobileDashboardScreen", () => {
  it("does not repeat the total item count below search controls", () => {
    render(
      <MobileDashboardScreen
        globalSearch=""
        onStatusChange={() => {}}
        onGoToWarehouse={() => {}}
      />,
    );

    expect(screen.getByTestId("kpi-panel")).toBeInTheDocument();
    expect(screen.queryByText("총 1건")).toBeNull();
  });
});
