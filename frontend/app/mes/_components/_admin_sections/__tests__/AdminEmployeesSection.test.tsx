import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AdminEmployeesSection } from "../AdminEmployeesSection";
import { DirtyGuardProvider } from "@/lib/ui/dirty-guard";

const setSelectedEmployee = vi.fn();
const context: any = {
  employees: [
    {
      employee_id: "emp-1",
      employee_code: "E01",
      name: "김건호",
      role: "작업자",
      department: "조립",
      level: "staff",
      warehouse_role: "none",
      department_role: "none",
      io_enabled: true,
      display_order: 1,
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      pin_is_default: true,
      assigned_model_slots: [],
    },
  ],
  departments: [
    { id: 1, name: "조립", display_order: 1, is_active: true, color_hex: "#c026d3" },
  ],
  selectedEmployee: null,
  setSelectedEmployee,
  empAddMode: false,
  setEmpAddMode: vi.fn(),
  empAddForm: {},
  setEmpAddForm: vi.fn(),
  addEmployee: vi.fn(),
  toggleEmployee: vi.fn(),
  confirmTarget: null,
  confirmToggle: vi.fn(),
  cancelConfirm: vi.fn(),
  editForm: {},
  setEditForm: vi.fn(),
  saveEmployee: vi.fn(),
  pinResetTarget: null,
  pinResetAdminPin: "",
  setPinResetAdminPin: vi.fn(),
  pinResetError: "",
  requestPinReset: vi.fn(),
  confirmPinReset: vi.fn(),
  cancelPinReset: vi.fn(),
  deleteTarget: null,
  requestDelete: vi.fn(),
  confirmDelete: vi.fn(),
  cancelDelete: vi.fn(),
  dirty: false,
};

vi.mock("../AdminEmployeesContext", () => ({
  useAdminEmployeesContext: () => context,
}));

vi.mock("@/lib/queries/useModelsQuery", () => ({
  useModelsQuery: () => ({ data: [] }),
}));

describe("AdminEmployeesSection", () => {
  it("부서 마스터의 저장 색상 변경을 직원 목록 점에 즉시 반영한다", () => {
    const { rerender } = render(
      <DirtyGuardProvider>
        <AdminEmployeesSection />
      </DirtyGuardProvider>,
    );
    const employeeRow = screen.getByRole("button", { name: /김건호/ });

    expect(employeeRow.querySelector("span.h-2.w-2")).toHaveStyle({ background: "#c026d3" });

    context.departments = [
      { id: 1, name: "조립", display_order: 1, is_active: true, color_hex: "#0891b2" },
    ];
    rerender(
      <DirtyGuardProvider>
        <AdminEmployeesSection />
      </DirtyGuardProvider>,
    );

    expect(employeeRow.querySelector("span.h-2.w-2")).toHaveStyle({ background: "#0891b2" });
  });
  it("부서 필터를 목록 헤더 오른쪽의 넓은 선택 상자로 표시한다", () => {
    render(
      <DirtyGuardProvider>
        <AdminEmployeesSection />
      </DirtyGuardProvider>,
    );

    const deptFilter = screen.getByRole("combobox", { name: "부서 필터" });
    expect(deptFilter.parentElement).toHaveClass("w-[144px]");
    expect(screen.getByText("직원 목록").parentElement?.parentElement).toContainElement(deptFilter);
  });

  it("직원 추가를 시작하면 비어 있는 직급을 사원으로 채운다", () => {
    context.empAddForm = { role: "" };
    context.setEmpAddForm.mockClear();
    render(
      <DirtyGuardProvider>
        <AdminEmployeesSection />
      </DirtyGuardProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "직원 추가" }));

    expect(context.setEmpAddForm).toHaveBeenCalledOnce();
    const updateForm = context.setEmpAddForm.mock.calls[0][0];
    expect(updateForm({ role: "" }).role).toBe("사원");
  });
});
