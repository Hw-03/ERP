import { beforeEach, describe, expect, it, vi } from "vitest";
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
const defaultEmployee = context.employees[0];
const defaultDepartments = context.departments;

beforeEach(() => {
  vi.clearAllMocks();
  context.employees = [defaultEmployee];
  context.departments = defaultDepartments;
  context.selectedEmployee = null;
  context.editForm = {};
});

vi.mock("../AdminEmployeesContext", () => ({
  useAdminEmployeesContext: () => context,
}));

vi.mock("@/lib/queries/useModelsQuery", () => ({
  useModelsQuery: () => ({ data: [] }),
}));

describe("AdminEmployeesSection", () => {
  it("legacy 부서/직급은 목록과 선택 헤더에서 표준 직급으로 표시한다", () => {
    const legacyEmployee = {
      ...context.employees[0],
      department: "영업",
      role: "영업/과장",
    };
    context.employees = [legacyEmployee];
    context.selectedEmployee = legacyEmployee;
    context.editForm = {
      name: legacyEmployee.name,
      role: "과장",
      phone: "",
      department: "영업",
      level: "staff",
      warehouse_role: "none",
      department_role: "none",
      hidden_sidebar_tabs: [],
      assigned_model_slots: [],
    };

    render(
      <DirtyGuardProvider>
        <AdminEmployeesSection />
      </DirtyGuardProvider>,
    );

    expect(screen.getAllByText("영업 · 과장")).toHaveLength(2);
  });

  it("비선택 legacy 직원도 목록에서 표준 직급으로 표시한다", () => {
    const selectedEmployee = {
      ...context.employees[0],
      department: "조립",
      role: "사원",
    };
    const legacyEmployee = {
      ...context.employees[0],
      employee_id: "emp-2",
      employee_code: "E02",
      name: "영업 직원",
      department: "영업",
      role: "영업/과장",
    };
    context.employees = [selectedEmployee, legacyEmployee];
    context.selectedEmployee = selectedEmployee;
    context.editForm = {
      name: selectedEmployee.name,
      role: "사원",
      phone: "",
      department: "조립",
      level: "staff",
      warehouse_role: "none",
      department_role: "none",
      hidden_sidebar_tabs: [],
      assigned_model_slots: [],
    };

    render(
      <DirtyGuardProvider>
        <AdminEmployeesSection />
      </DirtyGuardProvider>,
    );

    expect(screen.getByRole("button", { name: /영업 직원/ })).toHaveTextContent("영업 · 과장");
  });

  it("선택 직원의 부서와 직급 편집은 저장 전 목록과 헤더에 즉시 반영하고 저장하지 않는다", () => {
    const selectedEmployee = {
      ...context.employees[0],
      department: "영업",
      role: "영업/과장",
    };
    context.employees = [selectedEmployee];
    context.departments = [
      { id: 1, name: "영업", display_order: 1, is_active: true, color_hex: "#c026d3" },
      { id: 2, name: "조립", display_order: 2, is_active: true, color_hex: "#0891b2" },
    ];
    context.selectedEmployee = selectedEmployee;
    context.editForm = {
      name: selectedEmployee.name,
      role: "과장",
      phone: "",
      department: "영업",
      level: "staff",
      warehouse_role: "none",
      department_role: "none",
      hidden_sidebar_tabs: [],
      assigned_model_slots: [],
    };
    context.setEditForm.mockImplementation((updater: (form: typeof context.editForm) => typeof context.editForm) => {
      context.editForm = updater(context.editForm);
    });
    context.saveEmployee.mockClear();

    const { rerender } = render(
      <DirtyGuardProvider>
        <AdminEmployeesSection />
      </DirtyGuardProvider>,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "직급" }));
    fireEvent.mouseDown(screen.getByRole("option", { name: "대리" }));
    rerender(
      <DirtyGuardProvider>
        <AdminEmployeesSection />
      </DirtyGuardProvider>,
    );

    fireEvent.click(screen.getAllByRole("combobox")[2]);
    fireEvent.mouseDown(screen.getByRole("option", { name: "조립" }));
    rerender(
      <DirtyGuardProvider>
        <AdminEmployeesSection />
      </DirtyGuardProvider>,
    );

    expect(screen.getAllByText("조립 · 대리")).toHaveLength(2);
    expect(context.saveEmployee).not.toHaveBeenCalled();
  });

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
