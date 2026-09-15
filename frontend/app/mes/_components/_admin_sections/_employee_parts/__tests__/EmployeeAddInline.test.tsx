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

  it("AS·연구 사용출고의 AR·AA 부서 재고 승인 권한을 별도 boolean으로 설정한다", () => {
    const setForm = vi.fn();
    render(
      <EmployeeAddInline
        form={{
          name: "", role: "사원", phone: "", department: "조립",
          warehouse_role: "none", department_role: "none", as_research_approver: false,
          assigned_model_slots: [],
        }}
        setForm={setForm}
        departments={departments}
        productModels={[]}
        onSubmit={vi.fn()}
      />,
    );

    const toggle = screen.getByRole("checkbox", { name: "AS·연구 승인 권한" });
    expect(screen.getByText(/AS·연구 사용출고 중 부서 재고의 AR·AA 품목 승인/)).toBeInTheDocument();
    expect(screen.getByText(/대상 직원은 다음 로그인부터 승인함 탭 반영/)).toBeInTheDocument();
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(setForm).toHaveBeenCalledOnce();
    expect(setForm.mock.calls[0][0]({ as_research_approver: false }).as_research_approver).toBe(true);
  });
});
