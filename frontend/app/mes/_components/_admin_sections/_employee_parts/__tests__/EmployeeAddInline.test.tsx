import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { DepartmentMaster } from "@/lib/api";
import { EmployeeAddInline } from "../EmployeeAddInline";

const departments: DepartmentMaster[] = [
  { id: 1, name: "조립", display_order: 1, is_active: true, color_hex: null },
];

describe("EmployeeAddInline", () => {
  it("새 직원 직급은 사원을 기본값으로 둔 선택 목록이다", () => {
    render(
      <EmployeeAddInline
        form={{
          name: "",
          role: "사원",
          phone: "",
          department: "조립",
          warehouse_role: "none",
          department_role: "none",
          assigned_model_slots: [],
        }}
        setForm={vi.fn()}
        departments={departments}
        productModels={[]}
        onSubmit={vi.fn()}
      />,
    );

    const selectors = screen.getAllByRole("combobox");
    expect(selectors).toHaveLength(4);
    expect(screen.getByRole("combobox", { name: "직급" })).toBe(selectors[0]);
    expect(selectors[0]).toHaveTextContent("사원");

    fireEvent.click(selectors[0]);
    expect(screen.getByRole("option", { name: "책임연구원" })).toBeInTheDocument();
  });
});
