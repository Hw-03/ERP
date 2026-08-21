/**
 * InventoryItemsTable — useChunkedRender 통합 테스트.
 *
 * 탭 전환 시 실제 렌더 비용(Long Task)을 줄이기 위해 displayLimit 개수를
 * 한 번에 다 그리지 않고 chunk 단위로 나눠 그린다. 초기 마운트 시
 * chunkSize개(기본 50)만 <tr>로 존재해야 한다.
 */
import { describe, it, expect, vi } from "vitest";
import { render, act } from "@testing-library/react";
import type { ReactElement } from "react";
import { InventoryItemsTable } from "../InventoryItemsTable";
import { DepartmentsProvider } from "../../DepartmentsContext";
import type { Item } from "@/lib/api";

// jsdom 에는 IntersectionObserver 가 없음 — useChunkedRender 가 sentinel 관찰에 사용.
// 마지막 콜백을 보관해서 테스트에서 직접 "sentinel이 보인다"를 트리거할 수 있게 한다.
let lastIntersectionCallback: IntersectionObserverCallback | null = null;
class MockIntersectionObserver {
  constructor(cb: IntersectionObserverCallback) {
    lastIntersectionCallback = cb;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}
// @ts-expect-error jsdom 폴리필 — 테스트 전용
globalThis.IntersectionObserver = MockIntersectionObserver;

function fireIntersection() {
  lastIntersectionCallback?.(
    [{ isIntersecting: true } as IntersectionObserverEntry],
    {} as IntersectionObserver,
  );
}

vi.mock("@/lib/api", () => ({
  api: {
    getDepartments: vi.fn().mockResolvedValue([]),
  },
}));

function renderWithProviders(ui: ReactElement) {
  return render(<DepartmentsProvider>{ui}</DepartmentsProvider>);
}

function makeItem(i: number): Item {
  return {
    item_id: `I${i}`,
    item_name: `품목${i}`,
    unit: "EA",
    quantity: 10,
    warehouse_qty: 10,
    production_total: 0,
    defective_total: 0,
    pending_quantity: 0,
    available_quantity: 10,
    last_reserver_name: null,
    location: null,
    locations: [],
    legacy_part: null,
    legacy_item_type: null,
    supplier: null,
    min_stock: null,
    mes_code: null,
    model_symbol: null,
    model_slots: [],
    process_type_code: null,
    serial_no: null,
    bom_completed_at: null,
    deleted_at: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    department: null,
  };
}

const baseProps = {
  error: null,
  loading: false,
  selectedItem: null,
  onSelectItem: () => {},
  activeFilterCount: 0,
  hasKpiFilter: false,
  onRetry: () => {},
  onResetAllFilters: () => {},
};

describe("InventoryItemsTable — chunked render", () => {
  it("데스크톱에서는 바깥 작업영역 기준으로 검색창 아래 열 헤더를 고정한다", () => {
    const item = makeItem(1);
    const { container, rerender } = renderWithProviders(
      <InventoryItemsTable
        {...baseProps}
        filteredItems={[item]}
        displayLimit={100}
        setDisplayLimit={() => {}}
      />,
    );

    const desktopTable = container.querySelector("table");
    expect(desktopTable?.parentElement).not.toHaveClass("overflow-x-auto");
    expect(desktopTable?.parentElement).toHaveClass("overflow-clip");
    expect(desktopTable?.parentElement).not.toHaveClass("border");
    expect(container.querySelector("thead")).toHaveClass("top-[71px]");
    const desktopCornerMask = container.querySelector('[data-testid="inventory-table-corner-mask"]');
    expect(desktopCornerMask).toHaveClass("sticky", "top-[71px]", "z-20", "-mb-6");
    expect(desktopCornerMask?.children).toHaveLength(2);
    expect(desktopCornerMask?.children[0].getAttribute("style")).toContain(
      "var(--c-inventory-table-corner-backdrop)",
    );
    const desktopHeaders = Array.from(container.querySelectorAll("th"));
    expect(desktopHeaders[0]).toHaveClass("rounded-tl-[24px]");
    expect(desktopHeaders.at(-1)).toHaveClass("rounded-tr-[24px]");
    expect(desktopHeaders[0]).toHaveStyle({ background: "var(--c-inventory-table-header)" });

    rerender(
      <DepartmentsProvider>
        <InventoryItemsTable
          {...baseProps}
          filteredItems={[item]}
          displayLimit={100}
          setDisplayLimit={() => {}}
          compact
        />
      </DepartmentsProvider>,
    );

    const compactTable = container.querySelector("table");
    expect(compactTable?.parentElement).toHaveClass("overflow-x-auto");
    expect(compactTable?.parentElement).not.toHaveClass("overflow-clip");
    expect(compactTable?.parentElement).toHaveClass("border");
    expect(container.querySelector("thead")).toHaveClass("top-0");
    expect(container.querySelector('[data-testid="inventory-table-corner-mask"]')).not.toBeInTheDocument();
    const compactHeaders = Array.from(container.querySelectorAll("th"));
    expect(compactHeaders[0]).toHaveClass("rounded-tl-[24px]");
    expect(compactHeaders.at(-1)).toHaveClass("rounded-tr-[24px]");
  });

  it("displayLimit 100개 중 첫 chunk(20)만 초기 렌더", () => {
    const items = Array.from({ length: 100 }, (_, i) => makeItem(i));
    const { container } = renderWithProviders(
      <InventoryItemsTable
        {...baseProps}
        filteredItems={items}
        displayLimit={100}
        setDisplayLimit={() => {}}
      />,
    );
    const rows = container.querySelectorAll("tbody tr");
    expect(rows.length).toBe(20);
  });

  it("displayLimit이 chunkSize보다 작으면 displayLimit만큼만 렌더", () => {
    const items = Array.from({ length: 100 }, (_, i) => makeItem(i));
    const { container } = renderWithProviders(
      <InventoryItemsTable
        {...baseProps}
        filteredItems={items}
        displayLimit={10}
        setDisplayLimit={() => {}}
      />,
    );
    const rows = container.querySelectorAll("tbody tr");
    expect(rows.length).toBe(10);
  });

  it("전체 품목이 chunkSize 이하면 전부 렌더", () => {
    const items = Array.from({ length: 5 }, (_, i) => makeItem(i));
    const { container } = renderWithProviders(
      <InventoryItemsTable
        {...baseProps}
        filteredItems={items}
        displayLimit={100}
        setDisplayLimit={() => {}}
      />,
    );
    const rows = container.querySelectorAll("tbody tr");
    expect(rows.length).toBe(5);
  });

  it("스크롤로 다음 chunk를 불러온 뒤 무관한 리렌더가 와도 20개로 되돌아가지 않는다", () => {
    // 회귀 테스트: filteredItems.slice()를 useMemo 없이 넘기면 매 렌더 새
    // 배열 참조가 생겨 useChunkedRender의 리셋 이펙트가 스크롤로 늘어난
    // count를 즉시 20개로 되돌려 버렸다(실제 버그, 브라우저 실측으로 발견).
    const items = Array.from({ length: 100 }, (_, i) => makeItem(i));
    const { container, rerender } = renderWithProviders(
      <InventoryItemsTable
        {...baseProps}
        filteredItems={items}
        displayLimit={100}
        setDisplayLimit={() => {}}
      />,
    );
    expect(container.querySelectorAll("tbody tr").length).toBe(20);

    act(() => fireIntersection());
    rerender(
      <DepartmentsProvider>
        <InventoryItemsTable
          {...baseProps}
          filteredItems={items}
          displayLimit={100}
          setDisplayLimit={() => {}}
        />
      </DepartmentsProvider>,
    );
    expect(container.querySelectorAll("tbody tr").length).toBe(40);

    // selectedItem 변경 등 filteredItems/displayLimit 와 무관한 리렌더를 흉내.
    rerender(
      <DepartmentsProvider>
        <InventoryItemsTable
          {...baseProps}
          filteredItems={items}
          displayLimit={100}
          selectedItem={items[0]}
          setDisplayLimit={() => {}}
        />
      </DepartmentsProvider>,
    );
    expect(container.querySelectorAll("tbody tr").length).toBe(40);
  });
});
