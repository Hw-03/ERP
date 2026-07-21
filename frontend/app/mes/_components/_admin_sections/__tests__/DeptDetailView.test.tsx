import { render, screen } from "@testing-library/react";
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
  it("현재 색상은 유지하고 전체 팔레트는 기본 접힘으로 제공한다", () => {
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
    expect(screen.getByText("전체 색상 보기").closest("details")).not.toHaveAttribute("open");
  });
});
