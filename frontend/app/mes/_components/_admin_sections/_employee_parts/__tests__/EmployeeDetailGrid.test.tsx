import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { DepartmentMaster, Employee } from "@/lib/api";
import { EmployeeDetailGrid } from "../EmployeeDetailGrid";
import type { EmployeeEditForm } from "../../../_admin_hooks/useAdminEmployees";
import { normalizeEmployeePosition } from "../employeeRoleLabels";

const employee: Employee = {
  employee_id: "emp-001",
  employee_code: "E01",
  name: "김건호",
  role: "튜브/주임",
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
  role: "주임",
  phone: employee.phone ?? "",
  department: employee.department,
  level: employee.level,
  warehouse_role: employee.warehouse_role,
  department_role: employee.department_role,
  hidden_sidebar_tabs: employee.hidden_sidebar_tabs ?? [],
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

  it("비활성화와 삭제를 일반 권한과 분리한 위험 작업 영역에 둔다", () => {
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

    expect(screen.getByText("계정 상태 및 위험 작업")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "직원 비활성화" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "직원 삭제" })).toBeInTheDocument();
  });
  it("직급 정규화는 raw role 하나만 받는다", () => {
    expect(normalizeEmployeePosition).toHaveLength(1);
  });

  it("직급 선택기는 기존 직급 옵션 없이 표준 직급만 표시한다", () => {
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

    fireEvent.click(screen.getByRole("combobox", { name: "직급" }));

    expect(screen.queryByRole("option", { name: "기존 직급: 튜브/주임" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "주임" })).toBeInTheDocument();
  });

  it("PIN 상태와 마지막 변경일을 제목 보조 영역에 표시하고 본문에는 초기화 버튼만 둔다", () => {
    render(
      <EmployeeDetailGrid
        employee={{ ...employee, pin_last_changed: "2026-07-01T00:00:00Z" }}
        form={form}
        setForm={vi.fn()}
        departments={departments}
        productModels={[]}
        onRequestPinReset={vi.fn()}
        onToggle={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    const header = screen.getByText("PIN").parentElement;
    expect(header).not.toBeNull();
    expect(within(header!).getByText("기본 PIN (0000)")).toBeInTheDocument();
    expect(within(header!).getByText(/마지막 변경:/)).toBeInTheDocument();
    expect(header!.nextElementSibling).toBe(screen.getByRole("button", { name: "PIN 초기화 (0000)" }));
  });

  it("PIN과 위험 작업 카드는 각각 내용 높이만 사용한다", () => {
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

    const dangerCard = screen.getByText("계정 상태 및 위험 작업").parentElement?.parentElement;
    expect(dangerCard?.parentElement).toHaveClass("items-start");
  });
});
