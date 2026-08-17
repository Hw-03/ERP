import { fireEvent, render, screen } from "@testing-library/react";
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
  InventoryKpiPanel: ({ onChange }: { onChange: (key: "ALL") => void }) => (
    <button type="button" onClick={() => onChange("ALL")}>
      전체 초기화 KPI
    </button>
  ),
}));

vi.mock("../_inventory_sections/InventoryCapacityPanel", () => ({
  InventoryCapacityPanel: () => <div data-testid="inventory-capacity-panel" />,
}));

vi.mock("../_inventory_sections/InventoryFilterToggleButton", () => ({
  InventoryFilterToggleButton: ({
    logic,
    onLogicChange,
  }: {
    logic: "AND" | "OR";
    onLogicChange: (logic: "AND" | "OR") => void;
  }) => (
    <>
      <output data-testid="filter-logic">{logic}</output>
      <button type="button" onClick={() => onLogicChange("OR")}>
        OR로 전환
      </button>
    </>
  ),
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
    expect(scroller).not.toHaveClass("rounded-[28px]", "desktop-flat-surface");
    expect(scroller).not.toHaveClass("border");
    expect(scroller).not.toHaveStyle({ background: "var(--c-s1)" });
  });

  it("uses flat work surfaces instead of elevated dashboard cards", () => {
    const { container } = render(
      <DesktopInventoryView
        globalSearch=""
        onStatusChange={vi.fn()}
        onGoToWarehouse={vi.fn()}
      />,
    );

    expect(container.querySelectorAll("section.desktop-flat-surface")).toHaveLength(2);
  });

  it("기본 AND에서 OR로 바꾼 뒤 전체 초기화하면 AND로 돌아간다", () => {
    render(
      <DesktopInventoryView
        globalSearch=""
        onStatusChange={vi.fn()}
        onGoToWarehouse={vi.fn()}
      />,
    );

    expect(screen.getByTestId("filter-logic")).toHaveTextContent("AND");

    fireEvent.click(screen.getByRole("button", { name: "OR로 전환" }));
    expect(screen.getByTestId("filter-logic")).toHaveTextContent("OR");

    fireEvent.click(screen.getByRole("button", { name: "전체 초기화 KPI" }));
    expect(screen.getByTestId("filter-logic")).toHaveTextContent("AND");
  });
});
