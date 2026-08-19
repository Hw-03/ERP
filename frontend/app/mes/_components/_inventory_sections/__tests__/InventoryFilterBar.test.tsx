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
  it("uses an opaque token surface and compact gap for the sticky table controls", () => {
    render(
      <InventoryTableStickyHeader
        searchValue=""
        onSearchChange={() => {}}
        count={0}
        isFiltered={false}
      />,
    );

    const header = screen.getByText("자재 목록").closest(".sticky");
    expect(header).toHaveStyle({ background: "var(--c-popup-bg)" });
    expect(header).toHaveClass("mb-0");
  });

  it("불용 칩을 렌더하고 안내 문구 없이 토글을 전달한다", () => {
    render(<InventoryFilters {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: "불용" }));

    expect(baseProps.toggleDisused).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("선택한 부서·모델·공정을 모두 만족합니다.")).not.toBeInTheDocument();
  });
});
