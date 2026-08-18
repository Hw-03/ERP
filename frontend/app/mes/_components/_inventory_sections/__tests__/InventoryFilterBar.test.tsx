import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InventoryFilters, InventoryTableStickyHeader } from "../InventoryFilterBar";

const baseProps = {
  open: true,
  selectedDepts: [],
  selectedModels: [],
  selectedProcessSteps: [],
  productModels: [],
  toggleDept: vi.fn(),
  toggleModel: vi.fn(),
  toggleProcessStep: vi.fn(),
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

  it("AND와 OR의 적용 범위 및 같은 분류 내부 OR 규칙을 안내한다", () => {
    const { rerender } = render(<InventoryFilters {...baseProps} logic="AND" />);

    expect(screen.getByText("선택한 부서·모델·공정을 모두 만족합니다.")).toBeInTheDocument();
    expect(
      screen.getByText("같은 구분에서 여러 항목을 선택하면 하나만 일치해도 됩니다."),
    ).toBeInTheDocument();

    rerender(<InventoryFilters {...baseProps} logic="OR" />);

    expect(
      screen.getByText("선택한 부서·모델·공정 중 하나만 만족해도 됩니다."),
    ).toBeInTheDocument();
  });
});
