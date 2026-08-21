import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InventoryFilters, InventoryTableStickyHeader } from "../InventoryFilterBar";

const baseProps = {
  open: true,
  selectedDepts: [],
  selectedModels: [],
  selectedProcessSteps: [],
  showDisused: false,
  productModels: [],
  toggleDept: vi.fn(),
  toggleModel: vi.fn(),
  toggleProcessStep: vi.fn(),
  toggleDisused: vi.fn(),
  onClearDepts: vi.fn(),
  onClearModels: vi.fn(),
  onClearProcessSteps: vi.fn(),
  onResetAll: vi.fn(),
  isAnyFilterActive: false,
};

describe("InventoryFilters", () => {
  it("보이는 목록 제목 없이 검색 입력 변경을 전달한다", () => {
    const onSearchChange = vi.fn();
    render(
      <InventoryTableStickyHeader
        searchValue=""
        onSearchChange={onSearchChange}
        count={0}
        isFiltered={false}
      />,
    );

    const searchInput = screen.getByRole("textbox", { name: "자재 검색" });
    const header = searchInput.closest(".sticky");
    const headerContent = header?.firstElementChild;
    expect(screen.queryByText("자재 목록")).not.toBeInTheDocument();
    expect(searchInput).toHaveAttribute("placeholder", "품명 · 품목 코드 · 위치 · 공급처 검색");
    expect(header).toHaveStyle({ background: "var(--c-popup-bg)" });
    expect(header).toHaveClass("mb-0");
    expect(headerContent).toHaveClass("pt-[14px]", "pb-[15px]");
    expect(headerContent).not.toHaveClass("pt-[11px]", "pb-3");

    fireEvent.change(searchInput, { target: { value: "진공" } });

    expect(onSearchChange).toHaveBeenCalledWith("진공");
  });

  it("스크롤 고정 검색 헤더의 24px 상단 곡률을 배경과 분리한다", () => {
    render(
      <InventoryTableStickyHeader
        searchValue=""
        onSearchChange={vi.fn()}
        count={0}
        isFiltered={false}
      />,
    );

    const header = screen.getByRole("textbox", { name: "자재 검색" }).closest(".sticky");
    const cornerMask = screen.getByTestId("inventory-sticky-header-corner-mask");

    expect(header).toHaveClass("rounded-t-[24px]");
    expect(header).not.toHaveClass("rounded-t-[28px]");
    expect(cornerMask).toHaveClass("pointer-events-none", "absolute", "left-0", "-right-px", "top-0", "z-30", "h-6");
    expect(cornerMask).not.toHaveClass("inset-x-0");
    expect(cornerMask.children).toHaveLength(2);
    expect(cornerMask.children[0].getAttribute("style")).toContain("var(--c-bg)");
    expect(cornerMask.children[1].getAttribute("style")).toContain("var(--c-bg)");
  });

  it("별도 AND/OR 안내 문구 없이 불용 칩을 렌더한다", () => {
    render(<InventoryFilters {...baseProps} />);

    const filterPanel = document.getElementById("inventory-filter-panel");
    expect(filterPanel).toHaveClass("mt-3", "gap-3");
    expect(filterPanel).not.toHaveClass("mt-2.5", "gap-2.5");
    expect(
      screen.queryByText("AND/OR는 같은 구분 안에서만 적용되며, 서로 다른 구분은 모두 만족해야 합니다."),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "불용" }));

    expect(baseProps.toggleDisused).toHaveBeenCalledTimes(1);
  });
});
