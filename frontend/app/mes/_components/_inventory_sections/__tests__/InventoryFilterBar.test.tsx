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
    expect(screen.queryByText("자재 목록")).not.toBeInTheDocument();
    expect(searchInput).toHaveAttribute("placeholder", "품명 · 품목 코드 · 위치 · 공급처 검색");
    expect(header).toHaveStyle({ background: "var(--c-popup-bg)" });
    expect(header).toHaveClass("mb-0");

    fireEvent.change(searchInput, { target: { value: "진공" } });

    expect(onSearchChange).toHaveBeenCalledWith("진공");
  });

  it("불용 칩을 렌더하고 구분 간 AND 규칙을 안내한다", () => {
    render(<InventoryFilters {...baseProps} />);

    expect(
      screen.getByText("AND/OR는 같은 구분 안에서만 적용되며, 서로 다른 구분은 모두 만족해야 합니다."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "불용" }));

    expect(baseProps.toggleDisused).toHaveBeenCalledTimes(1);
  });
});
