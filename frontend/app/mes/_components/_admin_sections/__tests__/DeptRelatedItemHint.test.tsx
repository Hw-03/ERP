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
  it("explains that an unmapped department can have zero related items", () => {
    render(
      <DeptDetailView
        dept={{ id: 2, name: "기타", display_order: 2, is_active: true, color_hex: "#2f74e7" }}
        adminPin="0000"
        empCount={0}
        itemCount={0}
        deptEmployees={[]}
        onSetDepartments={vi.fn()}
        setSelectedDept={vi.fn()}
        onStatusChange={vi.fn()}
        onError={vi.fn()}
        onToggleActive={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    expect(screen.getByText((_, element) => element?.textContent === "품목 코드 공정 기준 · 공정 코드 매핑 없음")).toBeInTheDocument();
  });

  it("normalizes a legacy process department before rendering the mapped hint", () => {
    render(
      <DeptDetailView
        dept={{ id: 3, name: "DepartmentEnum.SHIPPING", display_order: 3, is_active: true, color_hex: "#2f74e7" }}
        adminPin="0000"
        empCount={0}
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

    expect(screen.getByText("품목 코드 공정 기준")).toBeInTheDocument();
    expect(screen.queryByText("품목 코드 공정 기준 · 공정 코드 매핑 없음")).not.toBeInTheDocument();
  });
});
