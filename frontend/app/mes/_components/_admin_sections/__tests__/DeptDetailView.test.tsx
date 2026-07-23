import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DeptDetailView } from "../_department_parts/DeptDetailView";

vi.mock("@/lib/api", () => ({
  api: { updateDepartment: vi.fn() },
}));

vi.mock("../../DepartmentsContext", () => ({
  useRefreshDepartments: () => vi.fn(),
}));

vi.mock("@/lib/ui/ConfirmModal", () => ({
  ConfirmModal: () => null,
}));

describe("DeptDetailView", () => {
  it("starts the palette closed and exposes it through an accessible button", () => {
    render(
      <DeptDetailView
        dept={{ id: 1, name: "조립", display_order: 1, is_active: true, color_hex: "#2f74e7" }}
        adminPin="0000"
        empCount={1}
        itemCount={1}
        deptEmployees={[]}
        onSetDepartments={vi.fn()}
        setSelectedDept={vi.fn()}
        onStatusChange={vi.fn()}
        onError={vi.fn()}
        onToggleActive={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    expect(screen.getByTitle("현재 저장된 색상")).toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: "전체 색상 보기" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "department-color-palette");
    expect(toggle).not.toHaveClass("active:scale-[0.98]");
    expect(screen.queryByRole("button", { name: /blue-500/i })).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const blueSwatch = screen.getByRole("button", { name: /blue-500/i });
    expect(blueSwatch).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(blueSwatch);

    expect(blueSwatch).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("textbox", { name: "색상 코드" })).toHaveValue("#3b82f6");
  });

  it("가용 높이를 카드에 배분하고 위험 작업 행을 상세 영역 최하단에 둔다", () => {
    render(
      <DeptDetailView
        dept={{ id: 1, name: "조립", display_order: 1, is_active: true, color_hex: "#2f74e7" }}
        adminPin="0000"
        empCount={1}
        itemCount={1}
        deptEmployees={[]}
        onSetDepartments={vi.fn()}
        setSelectedDept={vi.fn()}
        onStatusChange={vi.fn()}
        onError={vi.fn()}
        onToggleActive={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    const colorCard = screen.getByText("색상").parentElement;
    const employeesCard = screen.getByText("소속 직원 (0명)").parentElement;
    const actions = screen.getByRole("button", { name: "부서 비활성화" }).parentElement;
    const layout = actions?.parentElement;

    expect(layout).toHaveClass("min-h-full");
    expect(colorCard).toHaveClass("min-h-0", "flex-1");
    expect(employeesCard).toHaveClass("min-h-0", "flex-1");
    expect(actions).toHaveClass("mt-auto");
  });
});
