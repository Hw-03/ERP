import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { DepartmentMaster, Employee } from "@/lib/api";
import { EmployeeDetailGrid } from "../EmployeeDetailGrid";
import type { EmployeeEditForm } from "../../../_admin_hooks/useAdminEmployees";
import { normalizeEmployeePosition } from "../employeeRoleLabels";
import { SIDEBAR_TAB_IDS } from "../../../tabAccess";
import { SIDEBAR_TAB_META } from "../../../sidebarTabMeta";

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
  it("메뉴 카드는 아이콘·이름·체크박스와 선택 상태 및 키보드 포커스를 표시한다", () => {
    render(
      <EmployeeDetailGrid employee={employee} form={{ ...form, hidden_sidebar_tabs: ["stocktake"] }} setForm={vi.fn()} departments={departments} productModels={[]} onRequestPinReset={vi.fn()} onToggle={vi.fn()} onRequestDelete={vi.fn()} />,
    );

    for (const tab of SIDEBAR_TAB_IDS) {
      const checkbox = screen.getByRole("checkbox", { name: SIDEBAR_TAB_META[tab].label });
      const card = checkbox.closest("label")!;
      expect(card).toHaveClass("min-h-12", "border", "has-[:focus-visible]:ring-2");
      expect(card.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
      expect(checkbox).toHaveProperty("checked", tab !== "stocktake");
    }
    expect(screen.queryByText(/직원별 메뉴 표시를 설정합니다/)).not.toBeInTheDocument();
    expect(screen.getByText("직원에게 보이는 메뉴")).toHaveClass("text-[16px]", "font-bold");
    expect(screen.queryByText(/관리자·회차 담당자는 일괄 변경에서 제외/)).not.toBeInTheDocument();
  });

  it("메뉴 카드 이름 클릭도 입출고·불량 연동 선택 규칙과 다른 권한을 보존한다", () => {
    const setForm = vi.fn();
    render(<EmployeeDetailGrid employee={employee} form={form} setForm={setForm} departments={departments} productModels={[]} onRequestPinReset={vi.fn()} onToggle={vi.fn()} onRequestDelete={vi.fn()} />);
    fireEvent.click(screen.getByText("입출고", { exact: true }));
    const next = setForm.mock.calls[0][0](form) as EmployeeEditForm;
    expect(next).toEqual({ ...form, hidden_sidebar_tabs: expect.arrayContaining(["warehouse", "defect"]) });
  });

  it("전수조사 표시를 독립적으로 숨기고 다시 허용하면 선택 카드 색상도 갱신한다", () => {
    const setForm = vi.fn();
    const props = { employee, form, setForm, departments, productModels: [], onRequestPinReset: vi.fn(), onToggle: vi.fn(), onRequestDelete: vi.fn() };
    const { rerender } = render(<EmployeeDetailGrid {...props} />);
    const checkbox = screen.getByRole("checkbox", { name: "재고 전수조사" });
    const card = checkbox.closest("label")!;
    const selectedStyle = {
      background: "var(--c-s1)",
      borderColor: "color-mix(in srgb, var(--c-blue) 24%, var(--c-border))",
    };
    expect(card).toHaveStyle(selectedStyle);
    fireEvent.click(checkbox);
    const hidden = setForm.mock.calls[0][0](form) as EmployeeEditForm;
    expect(hidden).toEqual({ ...form, hidden_sidebar_tabs: ["stocktake"] });
    rerender(<EmployeeDetailGrid {...props} form={hidden} />);
    expect(screen.getByRole("checkbox", { name: "재고 전수조사" })).not.toBeChecked();
    expect(card).toHaveStyle({ background: "color-mix(in srgb, var(--c-blue) 4%, var(--c-s1))", borderColor: "var(--c-border)" });
    fireEvent.click(screen.getByRole("checkbox", { name: "재고 전수조사" }));
    const shown = setForm.mock.calls[1][0](hidden) as EmployeeEditForm;
    expect(shown).toEqual(form);
    rerender(<EmployeeDetailGrid {...props} form={shown} />);
    expect(checkbox).toBeChecked();
    expect(card).toHaveStyle(selectedStyle);
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
    expect(warehouseSelect).toHaveTextContent("정 · 창고 주담당 결재");
    expect(departmentSelect).toHaveTextContent("부 · 보조 결재 가능");
    expect(screen.getByText("AR·AA 출고 승인")).toHaveClass("truncate");
    expect(screen.getByRole("checkbox", { name: "AS·연구 승인 권한" })).toBeChecked();

    fireEvent.click(warehouseSelect);
    expect(screen.getByRole("option", { name: "없음 · 기본 작업만 수행", exact: true })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "정 · 창고 주담당 결재", exact: true })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("option", { name: "부 · 보조 결재 가능", exact: true }));
    expect(setForm.mock.calls[0][0](selectedForm)).toEqual({ ...selectedForm, warehouse_role: "deputy" });

    fireEvent.click(departmentSelect);
    expect(screen.getByRole("option", { name: "없음 · 기본 작업만 수행", exact: true })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "부 · 보조 결재 가능", exact: true })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("option", { name: "정 · 부서 주담당 결재", exact: true }));
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

  it("기본 정보·결재 권한·메뉴를 분리하고 담당 모델 다음에 계정 작업을 배치한다", () => {
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

    const permissionsCard = screen.getByText("결재 권한").parentElement?.parentElement;
    const layout = permissionsCard?.parentElement;
    const basicFields = screen.getByRole("group", { name: "직원 기본 정보" });
    const menuCard = screen.getByText("직원에게 보이는 메뉴").parentElement?.parentElement;
    const assignedModelsCard = screen.getByText("담당 모델 (우선순위 순)").parentElement?.parentElement;
    const dangerCard = screen.getByText("계정 상태 및 위험 작업").parentElement?.parentElement;
    const actionArea = dangerCard?.parentElement;

    expect(basicFields.parentElement?.nextElementSibling).toBe(layout);
    expect(basicFields).toContainElement(screen.getByRole("textbox", { name: "이름" }));
    expect(permissionsCard?.parentElement).toBe(layout);
    expect(menuCard?.parentElement).toBe(layout);
    expect(within(permissionsCard!).getByRole("checkbox", { name: "AS·연구 승인 권한" })).toBeInTheDocument();
    expect(within(menuCard!).getAllByRole("checkbox")).toHaveLength(SIDEBAR_TAB_IDS.length);
    expect(actionArea?.parentElement).toBe(layout);
    expect(actionArea).toBe(layout?.lastElementChild);
    expect(assignedModelsCard?.parentElement?.nextElementSibling).toBe(actionArea);
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
    expect(assignedModelsCard?.parentElement).toHaveClass("lg:col-span-2");
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

  it("계정 작업은 고정 높이 없이 넓을 때 2열·좁을 때 1열의 본문 흐름을 따른다", () => {
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

    const permissionsCard = screen.getByText("결재 권한").parentElement?.parentElement;
    const layout = permissionsCard?.parentElement;
    const dangerCard = screen.getByText("계정 상태 및 위험 작업").parentElement?.parentElement;
    const actionArea = dangerCard?.parentElement;

    expect(layout).toHaveClass("min-h-0", "xl:items-stretch");
    expect(layout).not.toHaveClass("h-full");
    expect(screen.getByRole("group", { name: "직원 기본 정보" })).toBeInTheDocument();
    expect(permissionsCard).toHaveClass("h-full");
    expect(actionArea).toHaveClass("grid", "lg:grid-cols-2", "lg:col-span-2");
    expect(actionArea).not.toHaveClass("h-full", "grid-rows-[auto_minmax(0,1fr)]");
    expect(dangerCard).not.toHaveClass("h-full");
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
    expect(screen.getByText("AR·AA 출고 승인")).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(setForm.mock.calls[0][0]({ ...form, as_research_approver: false }).as_research_approver).toBe(true);
  });
});
