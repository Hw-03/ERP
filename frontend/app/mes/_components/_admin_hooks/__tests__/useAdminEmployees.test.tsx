import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, type Employee } from "@/lib/api";
import { useAdminEmployees } from "../useAdminEmployees";
import { readCurrentOperator } from "../../login/useCurrentOperator";

const employee: Employee = {
  employee_id: "employee-1",
  employee_code: "E01",
  name: "테스트 직원",
  role: "사원",
  phone: null,
  department: "조립",
  warehouse_role: "none",
  department_role: "none",
  as_research_approver: false,
  io_enabled: true,
  is_active: true,
  display_order: 1,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("직원 편집 저장 계약", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(["self", "other", "failure"] as const)("%s 저장은 현재 로그인과 성공 여부를 구분해 권한을 반영한다", async (mode) => {
    sessionStorage.setItem("dexcowin_mes_operator", JSON.stringify({ ...employee, employee_id: mode === "other" ? "someone-else" : employee.employee_id }));
    const saved = { ...employee, department_role: "primary" as const };
    const update = vi.spyOn(api, "updateEmployee");
    if (mode === "failure") update.mockRejectedValueOnce(new Error("저장 실패"));
    else update.mockResolvedValueOnce(saved);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const args = { departments: [], onStatusChange: vi.fn(), onError: vi.fn() };
    const { result, unmount } = renderHook(() => {
      const [employees, setEmployees] = useState([employee]);
      return useAdminEmployees({ ...args, employees, setEmployees });
    }, { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
    act(() => result.current.setSelectedEmployee(employee));
    act(() => result.current.setEditForm((current) => ({ ...current, department_role: "primary" })));
    await act(async () => {
      if (mode === "failure") await expect(result.current.saveEmployee()).rejects.toThrow("저장 실패");
      else await result.current.saveEmployee();
    });
    expect(readCurrentOperator()?.department_role).toBe(mode === "self" ? "primary" : "none");
    if (mode === "failure") expect(invalidate).not.toHaveBeenCalled();
    else expect(invalidate).toHaveBeenCalledWith({ queryKey: ["employees"] });
    unmount(); client.clear(); sessionStorage.clear();
  });

  it.each(["조립", "창고"] as const)("%s 직원의 기본 정보와 독립 권한을 한 번에 저장한다", async (department) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }): ReactNode => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const payload = {
      name: "수정 직원",
      role: "대리",
      phone: "010-0000-0000",
      department,
      warehouse_role: "primary" as const,
      department_role: "deputy" as const,
      as_research_approver: true,
      hidden_sidebar_tabs: ["stocktake"] as ["stocktake"],
      assigned_model_slots: department === "조립" ? [3, 7] : [],
    };
    const saved = { ...employee, ...payload };
    const update = vi.spyOn(api, "updateEmployee").mockResolvedValue(saved);
    const args = {
      departments: [],
      onStatusChange: vi.fn(),
      onError: vi.fn(),
    };
    const { result, unmount } = renderHook(() => {
      const [employees, setEmployees] = useState([employee]);
      return useAdminEmployees({ ...args, employees, setEmployees });
    }, { wrapper });
    act(() => result.current.setSelectedEmployee(employee));
    act(() => result.current.setEditForm((current) => ({
      ...current,
      ...payload,
      name: " 수정 직원 ",
      assigned_model_slots: [3, 7],
    })));
    expect(result.current.dirty).toBe(true);

    await act(async () => result.current.saveEmployee());

    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith(employee.employee_id, payload);
    expect(args.onError).not.toHaveBeenCalled();
    expect(result.current.selectedEmployee).toEqual(saved);
    expect(result.current.dirty).toBe(false);
    unmount();
    client.clear();
  });
});
