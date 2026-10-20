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
  it("resets permission pill identity for another employee while keeping the input and same-employee edits stable", () => {
    const view = (id: string, primary: boolean) => <EmployeeDetailGrid employee={{ ...employee, employee_id: id }} form={{ ...form, warehouse_role: primary ? "primary" : "none" }} setForm={vi.fn()} departments={departments} productModels={[]}
      onRequestPinReset={vi.fn()} onToggle={vi.fn()} onRequestDelete={vi.fn()} />;
    const { rerender } = render(view("first", false));
    const name = screen.getByRole("textbox", { name: "이름" });
    const group = screen.getByRole("radiogroup", { name: "창고 결재 권한" });
    rerender(view("first", true));
    expect(screen.getByRole("radiogroup", { name: "창고 결재 권한" })).toBe(group);
    rerender(view("second", false));
    const nextGroup = screen.getByRole("radiogroup", { name: "창고 결재 권한" });
    expect(nextGroup).not.toBe(group);
    expect(within(nextGroup).getByRole("radio", { name: "없음" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("textbox", { name: "이름" })).toBe(name);
  });
  it("결재 역할은 방향키·Home·End로 선택과 포커스를 함께 이동한다", () => {
    const setForm = vi.fn();
    render(<EmployeeDetailGrid employee={employee} form={form} setForm={setForm} departments={departments} productModels={[]}
      onRequestPinReset={vi.fn()} onToggle={vi.fn()} onRequestDelete={vi.fn()} />);
    const group = screen.getByRole("radiogroup", { name: "창고 결재 권한" });
    const none = within(group).getByRole("radio", { name: "없음" });
    const primary = within(group).getByRole("radio", { name: "정" });
    const deputy = within(group).getByRole("radio", { name: "부" });
    fireEvent.keyDown(none, { key: "ArrowRight" });
    expect(primary).toHaveFocus();
    expect(setForm.mock.lastCall![0](form).warehouse_role).toBe("primary");
    fireEvent.keyDown(primary, { key: "End" });
    expect(deputy).toHaveFocus();
    expect(setForm.mock.lastCall![0](form).warehouse_role).toBe("deputy");
    fireEvent.keyDown(deputy, { key: "ArrowRight" });
    expect(none).toHaveFocus();
    fireEvent.keyDown(primary, { key: "Home" });
    expect(none).toHaveFocus();
    expect(setForm.mock.lastCall![0](form).warehouse_role).toBe("none");
  });
  it("통합 계정 카드에서 PIN·활성 상태·삭제 작업을 기존 콜백으로 전달한다", () => {
    const onRequestPinReset = vi.fn();
    const onToggle = vi.fn();
    const onRequestDelete = vi.fn();
    render(<EmployeeDetailGrid employee={employee} form={form} setForm={vi.fn()} departments={departments} productModels={[]}
      onRequestPinReset={onRequestPinReset} onToggle={onToggle} onRequestDelete={onRequestDelete} />);
    const card = screen.getByText("PIN·계정 관리").parentElement!.parentElement!;
    fireEvent.click(within(card).getByRole("button", { name: "PIN 초기화 (0000)" }));
    fireEvent.click(within(card).getByRole("button", { name: "직원 비활성화" }));
    fireEvent.click(within(card).getByRole("button", { name: "직원 삭제" }));
    expect(onRequestPinReset).toHaveBeenCalledWith(employee);
    expect(onToggle).toHaveBeenCalledWith(employee);
    expect(onRequestDelete).toHaveBeenCalledWith(employee);
  });
  it("메뉴 카드는 아이콘·이름·체크박스와 선택 상태 및 키보드 포커스를 표시한다", () => {
    render(
      <EmployeeDetailGrid employee={employee} form={{ ...form, hidden_sidebar_tabs: ["stocktake"] }} setForm={vi.fn()} departments={departments} productModels={[]} onRequestPinReset={vi.fn()} onToggle={vi.fn()} onRequestDelete={vi.fn()} />,
    );

    for (const tab of SIDEBAR_TAB_IDS) {
      const checkbox = screen.getByRole("checkbox", { name: SIDEBAR_TAB_META[tab].label });
      const card = checkbox.closest("label")!;
      expect(card).toHaveClass("min-h-14", "border", "has-[:focus-visible]:ring-2");
      expect(card.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
      expect(checkbox).toHaveProperty("checked", tab !== "stocktake");
    }
    expect(screen.queryByText(/직원별 메뉴 표시를 설정합니다/)).not.toBeInTheDocument();
    expect(screen.getByText("메뉴 표시")).toHaveClass("text-[16px]", "font-bold");
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

    const warehouseField = screen.getByRole("radiogroup", { name: "창고 결재 권한" });
    const departmentField = screen.getByRole("radiogroup", { name: "부서 결재 권한" });
    const approvalField = screen.getByRole("radiogroup", { name: "AS·연구 승인 권한" });
    expect(within(warehouseField).getByRole("radio", { name: "정" })).toBeChecked();
    expect(within(departmentField).getByRole("radio", { name: "부" })).toBeChecked();
    expect(within(approvalField).getByRole("radio", { name: "승인" })).toBeChecked();
    expect(within(warehouseField).getByRole("radio", { name: "정" })).toHaveAccessibleDescription("창고 주담당 결재");

    fireEvent.click(within(warehouseField).getByRole("radio", { name: "부" }));
    expect(setForm.mock.calls[0][0](selectedForm)).toEqual({ ...selectedForm, warehouse_role: "deputy" });
    fireEvent.click(within(departmentField).getByRole("radio", { name: "정" }));
    expect(setForm.mock.calls[1][0](selectedForm)).toEqual({ ...selectedForm, department_role: "primary" });
    fireEvent.click(within(approvalField).getByRole("radio", { name: "없음" }));
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

    expect(screen.getByText("PIN·계정 관리")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "직원 비활성화" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "직원 삭제" })).toBeInTheDocument();
  });

  it("결재 아래 계정 카드를 두고 메뉴 옆 두 열 아래에 담당 모델을 배치한다", () => {
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
    const leftColumn = permissionsCard?.parentElement;
    const layout = leftColumn?.parentElement;
    const basicFields = screen.getByRole("group", { name: "직원 기본 정보" });
    const menuCard = screen.getByText("메뉴 표시").parentElement?.parentElement;
    const assignedModelsCard = screen.getByText("담당 모델 (우선순위 순)").parentElement?.parentElement;
    const accountCard = screen.getByText("PIN·계정 관리").parentElement?.parentElement;

    expect(basicFields.parentElement?.nextElementSibling).toBe(layout);
    expect(basicFields).toContainElement(screen.getByRole("textbox", { name: "이름" }));
    expect(leftColumn?.nextElementSibling).toBe(menuCard);
    expect(menuCard?.parentElement).toBe(layout);
    expect(within(permissionsCard!).getByRole("radiogroup", { name: "AS·연구 승인 권한" })).toBeInTheDocument();
    expect(within(menuCard!).getAllByRole("checkbox")).toHaveLength(SIDEBAR_TAB_IDS.length);
    expect(permissionsCard?.nextElementSibling).toBe(accountCard);
    expect(accountCard?.parentElement).toBe(leftColumn);
    expect(layout?.parentElement?.nextElementSibling).toContainElement(assignedModelsCard!);
    expect(layout).not.toContainElement(assignedModelsCard!);
  });

  it("조립 부서의 담당 모델 카드는 넓은 화면에서 두 열 전체를 사용한다", () => {
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
    expect(assignedModelsCard?.parentElement?.previousElementSibling).toContainElement(screen.getByText("메뉴 표시"));
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

  it("통합 계정 카드에서 PIN 상태와 마지막 변경일을 유지한다", () => {
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

    const card = screen.getByText("PIN·계정 관리").parentElement!.parentElement!;
    expect(within(card).getByText("기본 PIN (0000)")).toBeInTheDocument();
    expect(within(card).getByText(/마지막 변경:/)).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "PIN 초기화 (0000)" })).toBeInTheDocument();
  });

  it("계정 작업을 결재 권한·메뉴의 입력과 분리한 하나의 카드에 둔다", () => {
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
    const accountCard = screen.getByText("PIN·계정 관리").parentElement!.parentElement!;
    expect(screen.getByRole("group", { name: "직원 기본 정보" })).toBeInTheDocument();
    expect(permissionsCard).not.toContainElement(screen.getByRole("button", { name: "직원 삭제" }));
    expect(within(accountCard).getAllByRole("button")).toHaveLength(3);
    expect(within(accountCard).queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("AS·연구 승인 권한은 없음·승인 선택으로 변경한다", () => {
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

    const toggle = within(screen.getByRole("radiogroup", { name: "AS·연구 승인 권한" })).getByRole("radio", { name: "승인" });
    expect(toggle).toHaveAccessibleDescription("AR·AA 출고 승인");
    fireEvent.click(toggle);
    expect(setForm.mock.calls[0][0]({ ...form, as_research_approver: false }).as_research_approver).toBe(true);
  });
});
