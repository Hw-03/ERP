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
  warehouse_role: "none",
  department_role: "none",
  as_research_approver: false,
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
  warehouse_role: employee.warehouse_role,
  department_role: employee.department_role,
  as_research_approver: employee.as_research_approver,
  hidden_sidebar_tabs: employee.hidden_sidebar_tabs ?? [],
  assigned_model_slots: employee.assigned_model_slots ?? [],
};

const departments: DepartmentMaster[] = [
  { id: 1, name: "조립", display_order: 1, is_active: true, color_hex: null },
];

describe("EmployeeDetailGrid", () => {
  it("부서 표시명을 보여주고 선택 값은 기존 위치키로 보존한다", () => {
    const setForm = vi.fn();
    render(<EmployeeDetailGrid employee={employee} form={form} setForm={setForm}
      departments={[{ ...departments[0], display_name: "조립팀" }]}
      productModels={[]} onRequestPinReset={vi.fn()} onToggle={vi.fn()} onRequestDelete={vi.fn()} />);
    const field = screen.getByText("부서").parentElement!;
    const select = within(field).getByRole("combobox");
    expect(select).toHaveTextContent("조립팀");
    fireEvent.click(select);
    fireEvent.mouseDown(screen.getByRole("option", { name: "조립팀", exact: true }));
    expect(setForm.mock.calls[0][0](form).department).toBe("조립");
  });

  it("직원 편집 화면은 등급 control 없이 창고·부서 정·부와 AS·연구 역할을 독립적으로 유지한다", () => {
    const selectedForm: EmployeeEditForm = {
      ...form,
      warehouse_role: "primary",
      department_role: "deputy",
      as_research_approver: true,
    };
    const setForm = vi.fn();
    const { container } = render(
      <EmployeeDetailGrid
        employee={employee}
        form={selectedForm}
        setForm={setForm}
        departments={departments}
        productModels={[]}
        onRequestPinReset={vi.fn()}
        onToggle={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    expect(screen.queryByText(/^(직원 |시스템 |권한 )?등급$/)).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /등급|level|ADMIN|MANAGER|STAFF/i })).not.toBeInTheDocument();
    expect(container.querySelector('[name="level"], #emp-edit-level')).not.toBeInTheDocument();

    const warehouseField = screen.getByText("창고 결재 역할").parentElement!;
    const departmentField = screen.getByText("부서 결재 역할").parentElement!;
    const warehouseSelect = within(warehouseField).getByRole("combobox");
    const departmentSelect = within(departmentField).getByRole("combobox");
    expect(warehouseSelect).toHaveTextContent("정");
    expect(departmentSelect).toHaveTextContent("부");
    expect(screen.getByRole("checkbox", { name: "AS·연구 승인 권한" })).toBeChecked();

    fireEvent.click(warehouseSelect);
    expect(screen.getByRole("option", { name: "없음", exact: true })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "정", exact: true })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("option", { name: "부", exact: true }));
    expect(setForm.mock.calls[0][0](selectedForm)).toEqual({ ...selectedForm, warehouse_role: "deputy" });

    fireEvent.click(departmentSelect);
    expect(screen.getByRole("option", { name: "없음", exact: true })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "부", exact: true })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("option", { name: "정", exact: true }));
    expect(setForm.mock.calls[1][0](selectedForm)).toEqual({ ...selectedForm, department_role: "primary" });

    fireEvent.click(screen.getByRole("checkbox", { name: "AS·연구 승인 권한" }));
    expect(setForm.mock.calls[2][0](selectedForm)).toEqual({ ...selectedForm, as_research_approver: false });
  });

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

  it("xl에서는 기본 정보·권한·PIN 및 위험 작업을 세 번째 열에 배치한다", () => {
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

    const layout = screen.getByText("기본 정보").parentElement?.parentElement?.parentElement;
    const basicCard = screen.getByText("기본 정보").parentElement?.parentElement;
    const permissionsCard = screen.getByText("권한").parentElement?.parentElement;
    const dangerCard = screen.getByText("계정 상태 및 위험 작업").parentElement?.parentElement;
    const actionArea = dangerCard?.parentElement;

    expect(layout).toHaveClass("xl:grid-cols-3");
    expect(basicCard?.parentElement).toBe(layout);
    expect(permissionsCard?.parentElement).toBe(layout);
    expect(actionArea?.parentElement).toBe(layout);
    expect(actionArea).toHaveClass("xl:col-start-3", "xl:row-start-1");
  });

  it("조립 부서의 담당 모델 카드는 xl에서 세 열 전체를 사용한다", () => {
    render(
      <EmployeeDetailGrid
        employee={employee}
        form={{ ...form, department: "조립" }}
        setForm={vi.fn()}
        departments={departments}
        productModels={[]}
        onRequestPinReset={vi.fn()}
        onToggle={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    const assignedModelsCard = screen.getByText("담당 모델 (우선순위 순)").parentElement?.parentElement;
    expect(assignedModelsCard?.parentElement).toHaveClass("xl:col-span-3");
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

  it("데스크톱 카드가 공통 가용 높이를 채우고 위험 작업을 우측 열 하단까지 배치한다", () => {
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

    const layout = screen.getByText("기본 정보").parentElement?.parentElement?.parentElement;
    const basicCard = screen.getByText("기본 정보").parentElement?.parentElement;
    const permissionsCard = screen.getByText("권한").parentElement?.parentElement;
    const dangerCard = screen.getByText("계정 상태 및 위험 작업").parentElement?.parentElement;
    const actionArea = dangerCard?.parentElement;

    expect(layout).toHaveClass("h-full", "min-h-0", "xl:items-stretch");
    expect(basicCard).toHaveClass("h-full");
    expect(permissionsCard).toHaveClass("h-full");
    expect(actionArea).toHaveClass("h-full", "grid-rows-[auto_minmax(0,1fr)]");
    expect(dangerCard).toHaveClass("h-full");
  });

  it("AS·연구 승인 권한은 정·부 역할과 분리된 checkbox로 변경한다", () => {
    const setForm = vi.fn();
    render(
      <EmployeeDetailGrid
        employee={employee}
        form={form}
        setForm={setForm}
        departments={departments}
        productModels={[]}
        onRequestPinReset={vi.fn()}
        onToggle={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    const toggle = screen.getByRole("checkbox", { name: "AS·연구 승인 권한" });
    expect(screen.getByText(/AS·연구 사용출고 중 부서 재고의 AR·AA 품목 승인/)).toBeInTheDocument();
    expect(screen.getByText(/대상 직원은 다음 로그인부터 승인함 탭 반영/)).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(setForm.mock.calls[0][0]({ ...form, as_research_approver: false }).as_research_approver).toBe(true);
  });
});
