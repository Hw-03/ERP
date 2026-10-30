import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Item } from "@/lib/api";

import { DesktopInventoryView } from "../DesktopInventoryView";

vi.mock("@/lib/queries/useModelsQuery", () => ({
  useModelsQuery: () => ({ data: [] }),
}));

vi.mock("@/lib/queries/useItemsQuery", () => ({
  useItemQuery: () => ({ data: undefined, error: null, isFetching: false, refetch: vi.fn() }),
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
    onToggle,
  }: {
    logic: "AND" | "OR";
    onLogicChange: (logic: "AND" | "OR") => void;
    onToggle: () => void;
  }) => (
    <>
      <output data-testid="filter-logic">{logic}</output>
      <button type="button" onClick={onToggle}>
        기준 필터 열기
      </button>
      <button type="button" onClick={() => onLogicChange("OR")}>
        OR로 전환
      </button>
    </>
  ),
}));

vi.mock("../_inventory_sections/InventoryFilterBar", () => ({
  InventoryFilters: ({
    departmentFilterBasis,
    onDepartmentFilterBasisChange,
    onResetAll,
  }: {
    departmentFilterBasis: "location" | "code";
    onDepartmentFilterBasisChange: (basis: "location" | "code") => void;
    onResetAll: () => void;
  }) => (
    <div data-testid="inventory-filters">
      <output data-testid="department-filter-basis">{departmentFilterBasis}</output>
      <button type="button" onClick={() => onDepartmentFilterBasisChange("location")}>
        재고 위치 기준
      </button>
      <button type="button" onClick={onResetAll}>
        기준 필터 초기화
      </button>
    </div>
  ),
  InventoryTableStickyHeader: ({ onManageSearch, searchActions }: { onManageSearch?: () => void; searchActions?: import("react").ReactNode }) => <div data-testid="inventory-table-header"><button onClick={onManageSearch}>검색어 연결</button>{searchActions}</div>,
}));

vi.mock("../_inventory_sections/InventoryItemsTable", () => ({
  InventoryItemsTable: ({ selectedItem, detailOpen, onSelectItem }: { selectedItem: Item | null; detailOpen: boolean; onSelectItem: (item: Item | null) => void }) => <div data-testid="inventory-items-table">
    <button onClick={() => onSelectItem(selectedItem?.item_id === "test-item" && detailOpen ? null : { item_id: "test-item", item_name: "전극" } as Item)}>전극 행 선택</button>
  </div>,
}));

vi.mock("../_inventory_sections/DesktopInventoryRightPanel", () => ({
  DesktopInventoryRightPanel: ({ open, displayItem, onOpenCost }: { open: boolean; displayItem: Item | null; onOpenCost: () => void }) => <aside data-testid="inventory-right-panel" data-open={open}>{open ? <>{displayItem?.item_name}<button onClick={onOpenCost}>원가 분석 펼치기</button></> : null}</aside>,
}));
vi.mock("../_cost/CostAnalysisPanel", () => ({ CostAnalysisPanel: ({ onCollapse }: { onCollapse: () => void }) => <section aria-label="원가 분석"><button onClick={onCollapse}>분석 접기</button></section> }));
vi.mock("../_cost/CostAnalysisWorkspace", () => ({ CostAnalysisWorkspace: ({ initialItemId, onClose }: { initialItemId: string | null; onClose: () => void }) => <div role="region" aria-label="원가 분석" data-item-id={initialItemId ?? ""}><button onClick={onClose}>원가 분석 닫기</button></div> }));

function InventoryWithHeader() {
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  return <><div ref={setTarget} /><DesktopInventoryView globalSearch="" onStatusChange={vi.fn()} onGoToWarehouse={vi.fn()} costHeaderTarget={target} /></>;
}

describe("DesktopInventoryView scrollbar", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("세 화면 전환 동안 같은 선택 버튼을 유지한다", () => {
    render(<InventoryWithHeader />);
    const switcher = screen.getByRole("group", { name: "대시보드 보기" });
    const cost = screen.getByRole("button", { name: "원가 분석", exact: true });
    fireEvent.click(cost);
    expect(screen.getByRole("group", { name: "대시보드 보기" })).toBe(switcher);
    expect(screen.getByRole("button", { name: "원가 분석", exact: true })).toBe(cost);
    expect(cost).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "생산 가능", exact: true }));
    expect(screen.getByRole("group", { name: "대시보드 보기" })).toBe(switcher);
    fireEvent.click(screen.getByRole("button", { name: "재고 현황", exact: true }));
    expect(screen.getByRole("group", { name: "대시보드 보기" })).toBe(switcher);
  });

  it("기본 대시보드 본문을 원가분석으로 전환하고 복귀하면 목록을 복원한다", () => {
    render(<InventoryWithHeader />);
    expect(screen.getAllByRole("button", { name: "원가 분석", exact: true })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "원가 분석", exact: true }));
    expect(screen.getByRole("region", { name: "원가 분석" })).toHaveAttribute("data-item-id", "");
    expect(screen.queryByRole("dialog", { name: "원가 분석" })).not.toBeInTheDocument();
    expect(screen.getByTestId("inventory-list-card")).not.toBeVisible();
    expect(screen.getByTestId("inventory-list-card")).not.toHaveAttribute("hidden");
    fireEvent.click(screen.getByRole("button", { name: "원가 분석 닫기" }));
    expect(screen.getByTestId("inventory-list-card")).toBeVisible();
    expect(screen.getByTestId("inventory-list-card")).not.toHaveAttribute("hidden");
    fireEvent.click(screen.getByRole("button", { name: "원가 분석", exact: true }));
    expect(screen.getByRole("region", { name: "원가 분석" })).toBeVisible();
  });
  it("분석 품목 선택을 취소하면 행 선택은 기존 상세만 연다", () => {
    render(<InventoryWithHeader />);
    fireEvent.click(screen.getByRole("button", { name: "원가 분석", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "원가 분석 닫기" }));
    fireEvent.click(screen.getByRole("button", { name: "전극 행 선택" }));
    expect(screen.queryByRole("region", { name: "원가 분석" })).not.toBeInTheDocument();
    expect(screen.getByTestId("inventory-right-panel")).toHaveAttribute("data-open", "true");
  });
  it("원가 분석을 펼쳤다가 접어도 선택 품목과 검색·필터를 유지한다", () => {
    render(<DesktopInventoryView globalSearch="" onStatusChange={vi.fn()} onGoToWarehouse={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "OR로 전환" }));
    fireEvent.click(screen.getByRole("button", { name: "전극 행 선택" }));
    const scroller = screen.getByTestId("inventory-left-content");
    scroller.scrollTop = 160;
    fireEvent.click(screen.getByRole("button", { name: "원가 분석 펼치기" }));
    expect(screen.getByRole("region", { name: "원가 분석" })).toHaveAttribute("data-item-id", "test-item");
    expect(screen.getByTestId("inventory-list-card")).not.toHaveAttribute("hidden");
    fireEvent.click(screen.getByRole("button", { name: "원가 분석 닫기" }));
    expect(screen.getByTestId("inventory-list-card")).not.toHaveAttribute("hidden");
    expect(screen.getByTestId("filter-logic")).toHaveTextContent("OR");
    expect(screen.getByTestId("inventory-right-panel")).toHaveTextContent("전극");
    expect(screen.getByTestId("inventory-right-panel")).toHaveAttribute("data-open", "true");
    expect(scroller.scrollTop).toBe(160);
  });
  it("검색어 연결에서 행을 선택하면 같은 품목을 다시 선택해도 상세로 전환한다", () => {
    render(<DesktopInventoryView globalSearch="" onStatusChange={vi.fn()} onGoToWarehouse={vi.fn()} />);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      fireEvent.click(screen.getByRole("button", { name: "검색어 연결" }));
      expect(screen.getByRole("dialog", { name: "같은 뜻의 검색어" })).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "전극 행 선택" }));
      expect(screen.queryByRole("dialog", { name: "같은 뜻의 검색어" })).not.toBeInTheDocument();
      expect(screen.getByTestId("inventory-right-panel")).toHaveAttribute("data-open", "true");
      expect(screen.getByTestId("inventory-right-panel")).toHaveTextContent("전극");
    }
  });
  it("검색창에서 같은 뜻의 검색어 오른쪽 패널을 열 수 있다", () => {
    render(<DesktopInventoryView globalSearch="" onStatusChange={vi.fn()} onGoToWarehouse={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "검색어 연결" }));
    expect(screen.getByRole("dialog", { name: "같은 뜻의 검색어" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "검색어", exact: true })).toBeVisible();
  });
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
    expect(scroller).toHaveClass(
      "sg",
      "min-h-0",
      "flex-1",
      "overflow-y-auto",
      "[scrollbar-gutter:stable]",
      "sm:block",
      "sm:overflow-y-scroll",
    );
    expect(viewport).toHaveClass("relative", "min-h-0", "flex", "flex-1", "flex-col");
    expect(viewport).not.toHaveClass("rounded-[32px]");
    expect(viewport).not.toHaveClass("border");
    expect(viewport).not.toHaveStyle({ background: "var(--c-s1)", borderColor: "var(--c-border)" });
    expect(viewport).not.toHaveClass("overflow-y-auto");
    expect(listCard).toHaveClass("card", "desktop-flat-surface");
    expect(listCard.parentElement).toHaveClass("gap-3");
    expect(listCard.parentElement).not.toHaveClass("gap-2");
    expect(screen.getByRole("region", { name: "자재 목록" })).toBe(listCard);
    expect(listCard).not.toHaveClass("overflow-hidden", "overflow-y-auto");
    expect(screen.queryByTestId("inventory-items-scroll-region")).not.toBeInTheDocument();
    expect(screen.getByTestId("inventory-scroll-surface")).toHaveClass("min-h-full");
    const frame = screen.getByTestId("inventory-scroll-frame");
    expect(frame).toHaveClass("pointer-events-none", "absolute", "bottom-0", "left-0", "right-2.5", "z-30", "h-6");
    expect(frame.children).toHaveLength(2);
    expect(frame.children[0].getAttribute("style")).toContain("var(--c-bg)");
    expect(frame.children[1].getAttribute("style")).toContain("var(--c-bg)");
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

  it("기본 기준은 품목 코드이고 위치 기준 전환 후 전체 초기화하면 품목 코드로 돌아간다", () => {
    render(
      <DesktopInventoryView
        globalSearch=""
        onStatusChange={vi.fn()}
        onGoToWarehouse={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "기준 필터 열기" }));
    expect(screen.getByTestId("department-filter-basis")).toHaveTextContent("code");

    fireEvent.click(screen.getByRole("button", { name: "재고 위치 기준" }));
    expect(screen.getByTestId("department-filter-basis")).toHaveTextContent("location");

    fireEvent.click(screen.getByRole("button", { name: "기준 필터 초기화" }));
    expect(screen.getByTestId("department-filter-basis")).toHaveTextContent("code");
  });
});
