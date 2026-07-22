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
  level: "staff",
  warehouse_role: "none",
  department_role: "none",
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
});
