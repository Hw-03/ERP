import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useAdminEmployeesForm } from "../useAdminEmployeesForm";

const employee = (over: Partial<any> = {}): any => ({
  employee_id: "emp-1",
  employee_code: "E1",
  name: "권동환",
  role: "사원",
  phone: null,
  department: "조립",
  warehouse_role: "none",
  department_role: "none",
  as_research_approver: false,
  io_enabled: true,
  assigned_model_slots: [],
  hidden_sidebar_tabs: ["weekly", "admin"],
  display_order: 0,
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...over,
});

describe("useAdminEmployeesForm", () => {
  it("PIN 메타데이터만 갱신할 때 선택 상세는 갱신하고 미저장 이름·권한은 보존한다", () => {
    const original = employee({ pin_is_default: false });
    const refreshed = employee({ pin_is_default: true, pin_last_changed: "2026-10-07T01:00:00Z" });
    const { result, rerender } = renderHook(
      ({ employees }) => useAdminEmployeesForm(employees),
      { initialProps: { employees: [original] } },
    );
    act(() => result.current.setSelectedEmployee(original));
    act(() => result.current.setEditForm((form) => ({ ...form, name: "미저장 이름", warehouse_role: "primary" })));
    rerender({ employees: [refreshed] });
    expect(result.current.selectedEmployee).toBe(refreshed);
    expect(result.current.selectedEmployee?.pin_is_default).toBe(true);
    expect(result.current.editForm.name).toBe("미저장 이름");
    expect(result.current.editForm.warehouse_role).toBe("primary");
    expect(result.current.dirty).toBe(true);
  });

  it("직원 재조회 결과에서 삭제 모델을 제거하고 남은 담당 모델 순서로 선택 폼을 갱신한다", async () => {
    const original = employee({ assigned_model_slots: [3, 7, 1] });
    const refreshed = employee({ assigned_model_slots: [3, 1] });
    const { result, rerender } = renderHook(
      ({ employees }) => useAdminEmployeesForm(employees),
      { initialProps: { employees: [original] } },
    );
    act(() => result.current.setSelectedEmployee(original));
    expect(result.current.editForm.assigned_model_slots).toEqual([3, 7, 1]);

    rerender({ employees: [refreshed] });

    expect(result.current.selectedEmployee).toBe(refreshed);
    expect(result.current.editForm.assigned_model_slots).toEqual([3, 1]);
    expect(result.current.dirty).toBe(false);
  });

  it("loads hidden sidebar tabs into the edit form and marks changes dirty", async () => {
    const emp = employee();
    const { result } = renderHook(() => useAdminEmployeesForm([emp]));

    await act(async () => {
      result.current.setSelectedEmployee(emp);
    });

    expect(result.current.editForm.hidden_sidebar_tabs).toEqual(["weekly", "admin"]);
    expect("io_enabled" in result.current.editForm).toBe(false);
    expect(result.current.dirty).toBe(false);

    await act(async () => {
      result.current.setEditForm((form) => ({ ...form, hidden_sidebar_tabs: ["weekly"] }));
    });

    expect(result.current.dirty).toBe(true);
  });

  it.each([
    ["튜브/주임", true, "주임"],
    ["연구소/책임", true, "책임연구원"],
    ["진공/퇴사", false, "사원"],
    ["주임", false, "주임"],
    ["책임연구원", false, "책임연구원"],
  ])("정규화한 직급 %s을 초기 선택값으로 사용하며 dirty로 표시하지 않는다", async (role, is_active, expectedRole) => {
    const emp = employee({ role, is_active });
    const { result } = renderHook(() => useAdminEmployeesForm([emp]));

    await act(async () => {
      result.current.setSelectedEmployee(emp);
    });

    expect(result.current.editForm.role).toBe(expectedRole);
    expect(result.current.dirty).toBe(false);
  });

  it("AS·연구 승인 권한 변경을 저장 전 수정으로 추적한다", async () => {
    const emp = employee({ as_research_approver: false });
    const { result } = renderHook(() => useAdminEmployeesForm([emp]));
    await act(async () => {
      result.current.setSelectedEmployee(emp);
    });

    await act(async () => {
      result.current.setEditForm((form) => ({ ...form, as_research_approver: true }));
    });

    expect(result.current.dirty).toBe(true);
  });
});
