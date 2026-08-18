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
  it("keeps the original sticky boundary while the outer content scrolls the full dashboard", () => {
    const { container } = render(
      <DesktopInventoryView
        globalSearch=""
        onStatusChange={vi.fn()}
        onGoToWarehouse={vi.fn()}
      />,
    );

    const viewport = screen.getByTestId("inventory-left-viewport");
    const scroller = screen.getByTestId("inventory-left-content");
    const listCard = screen.getByTestId("inventory-list-card");

    expect(scroller).not.toBeNull();
    expect(scroller).not.toHaveClass("scrollbar-hide");
    expect(scroller).toHaveClass("sg", "min-h-0", "flex-1", "overflow-y-auto");
    expect(viewport).toHaveClass("min-h-0", "flex", "flex-1", "flex-col", "overflow-hidden", "rounded-[32px]");
    expect(viewport).not.toHaveClass("border");
    expect(viewport).not.toHaveStyle({ background: "var(--c-s1)", borderColor: "var(--c-border)" });
    expect(viewport).not.toHaveClass("overflow-y-auto");
    expect(listCard).toHaveClass("card", "desktop-flat-surface");
    expect(listCard).not.toHaveClass("overflow-hidden", "overflow-y-auto");
    expect(screen.queryByTestId("inventory-items-scroll-region")).not.toBeInTheDocument();
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
