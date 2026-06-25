import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { DepartmentMaster, Employee } from "@/lib/api";
import { EmployeeDetailGrid } from "../EmployeeDetailGrid";
import type { EmployeeEditForm } from "../../../_admin_hooks/useAdminEmployees";

const employee: Employee = {
  employee_id: "emp-001",
  employee_code: "E01",
  name: "김건호",
  role: "팀장",
  phone: "010-1234-5678",
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
};

const form: EmployeeEditForm = {
  name: employee.name,
  role: employee.role,
  phone: employee.phone ?? "",
  department: employee.department,
  level: employee.level,
  warehouse_role: employee.warehouse_role,
  department_role: employee.department_role,
  io_enabled: employee.io_enabled ?? true,
  assigned_model_slots: employee.assigned_model_slots ?? [],
};

const departments: DepartmentMaster[] = [
  { id: 1, name: "조립", display_order: 1, is_active: true, color_hex: null },
];

describe("EmployeeDetailGrid", () => {
  it("기본 정보 카드에 직원 사번을 표시한다", () => {
    render(
      <EmployeeDetailGrid
        employee={employee}
        form={form}
        setForm={vi.fn()}
        departments={departments}
        productModels={[]}
        onRequestPinReset={vi.fn()}
        onToggle={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("사번")).toBeInTheDocument();
    expect(screen.getByText("E01")).toBeInTheDocument();
  });
});
