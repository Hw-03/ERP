import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileDashboardScreen } from "../MobileDashboardScreen";

const inventoryState = vi.hoisted(() => ({ loading: false, items: [{ item_id: "item-1", item_name: "테스트 품목", quantity: 10, warehouse_qty: 10, locations: [], model_slots: [] }] }));
const kpiProps = vi.hoisted(() => vi.fn());

vi.mock("../../../_hooks/useInventoryData", () => ({
  useInventoryData: () => ({
    items: inventoryState.items,
    loading: inventoryState.loading,
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
  InventoryKpiPanel: (props: { loading?: boolean }) => {
    kpiProps(props);
    return <div data-testid="kpi-panel">전체 1</div>;
  },
}));

vi.mock("../../../_inventory_sections/InventoryCapacityPanel", () => ({
  InventoryCapacityPanel: () => null,
  capacityStatusBadge: () => null,
}));

vi.mock("../../../_inventory_sections/InventoryFilterBar", () => ({
  InventoryFilters: ({
    departmentFilterBasis,
    onDepartmentFilterBasisChange,
    onResetAll,
    showResetAll = true,
  }: {
    departmentFilterBasis: "location" | "code";
    onDepartmentFilterBasisChange: (basis: "location" | "code") => void;
    onResetAll: () => void;
    showResetAll?: boolean;
  }) => (
    <>
      <output data-testid="mobile-department-filter-basis">{departmentFilterBasis}</output>
      <button type="button" onClick={() => onDepartmentFilterBasisChange("location")}>
        재고 위치 기준
      </button>
      {showResetAll && <button type="button" onClick={onResetAll}>
        전체 초기화
      </button>}
    </>
  ),
}));

vi.mock("../../../_inventory_sections/InventoryItemsTable", () => ({
  InventoryItemsTable: ({ loading }: { loading: boolean }) => <div data-testid="inventory-table" data-loading={loading} />,
}));

vi.mock("../../../_inventory_sections/InventoryDetailPanel", () => ({
  InventoryDetailPanel: () => null,
}));

describe("MobileDashboardScreen", () => {
  beforeEach(() => {
    inventoryState.loading = false;
    inventoryState.items = [{ item_id: "item-1", item_name: "테스트 품목", quantity: 10, warehouse_qty: 10, locations: [], model_slots: [] }];
  });
  it("최초 조회 중에는 KPI와 생산 가능 접이식 버튼 자리를 유지한다", () => {
    inventoryState.loading = true;
    inventoryState.items = [];

    render(
      <MobileDashboardScreen
        globalSearch=""
        onStatusChange={() => {}}
        onGoToWarehouse={() => {}}
        capacityLoading
      />,
    );

    expect(kpiProps).toHaveBeenLastCalledWith(expect.objectContaining({ loading: true }));
    expect(screen.getByRole("status", { name: "생산 가능 수량 불러오는 중" })).toBeInTheDocument();
    const pendingHeader = screen.getByRole("button", { name: /생산 가능 현황/ });
    expect(pendingHeader).toHaveClass("min-h-11", "rounded-[14px]");
    expect(pendingHeader).toBeDisabled();

    inventoryState.loading = false;
    inventoryState.items = [{ item_id: "item-1", item_name: "테스트 품목", quantity: 10, warehouse_qty: 10, locations: [], model_slots: [] }];
  });

  it("캐시 복귀와 로컬 필터 변경은 준비된 목록을 강제 로딩하지 않는다", () => {
    render(<MobileDashboardScreen globalSearch="" onStatusChange={() => {}} onGoToWarehouse={() => {}} />);
    expect(screen.getByTestId("inventory-table")).toHaveAttribute("data-loading", "false");
    fireEvent.click(screen.getByRole("button", { name: "필터 열기" }));
    fireEvent.click(screen.getByRole("button", { name: "재고 위치 기준" }));
    expect(screen.getByTestId("inventory-table")).toHaveAttribute("data-loading", "false");
  });

  it("생산 가능 최초 실패는 재시도할 수 있다", () => {
    const retry = vi.fn();
    render(<MobileDashboardScreen globalSearch="" onStatusChange={() => {}} onGoToWarehouse={() => {}}
      capacityError="생산 가능 조회 실패" onCapacityRetry={retry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("데이터를 불러오지 못했습니다");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(retry).toHaveBeenCalledOnce();
  });

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

  it("기본 AND에서 OR로 바꾼 뒤 전체 초기화하면 AND로 돌아간다", () => {
    render(
      <MobileDashboardScreen
        globalSearch=""
        onStatusChange={() => {}}
        onGoToWarehouse={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "필터 열기" }));
    expect(screen.getByRole("button", { name: "AND" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "OR" }));
    expect(screen.getByRole("button", { name: "OR" })).toHaveAttribute("aria-pressed", "true");

    const resetButton = screen.getByRole("button", { name: "전체 초기화" });
    expect(screen.getAllByRole("button", { name: "전체 초기화" })).toHaveLength(1);
    expect(resetButton.closest(".sticky")).not.toBeNull();
    expect(resetButton).toBeEnabled();
    fireEvent.click(resetButton);
    expect(screen.getByRole("button", { name: "AND" })).toHaveAttribute("aria-pressed", "true");
    expect(resetButton).toBeDisabled();
  });

  it("기본 기준은 품목 코드이고 위치 기준 전환 후 전체 초기화하면 품목 코드로 돌아간다", () => {
    render(
      <MobileDashboardScreen
        globalSearch=""
        onStatusChange={() => {}}
        onGoToWarehouse={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "필터 열기" }));
    expect(screen.getByTestId("mobile-department-filter-basis")).toHaveTextContent("code");

    fireEvent.click(screen.getByRole("button", { name: "재고 위치 기준" }));
    expect(screen.getByTestId("mobile-department-filter-basis")).toHaveTextContent("location");

    fireEvent.click(screen.getByRole("button", { name: "전체 초기화" }));
    expect(screen.getByTestId("mobile-department-filter-basis")).toHaveTextContent("code");
  });
});
