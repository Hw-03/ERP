/**
 * Employees 도메인 API — `@/lib/api/employees`.
 *
 * Round-6 (R6-D2) 분리. 6 메소드:
 *   - getEmployees / createEmployee / updateEmployee / deleteEmployee
 *   - verifyEmployeePin / resetEmployeePin
 *
 * 외부 호환을 위해 `frontend/lib/api.ts` 가 spread merge.
 */

import { fetcher, parseError, postJson, toApiUrl } from "../api-core";
import type { Department, Employee, EmployeeLevel, WarehouseRole } from "./types";

export const employeesApi = {
  getEmployees: (params?: { department?: Department; activeOnly?: boolean }) => {
    const query = new URLSearchParams();
    if (params?.department) query.set("department", params.department);
    if (params?.activeOnly !== undefined) query.set("active_only", String(params.activeOnly));
    return fetcher<Employee[]>(toApiUrl(`/api/employees?${query}`));
  },

  createEmployee: (payload: {
    employee_code: string;
    name: string;
    role: string;
    phone?: string;
    department: Department;
    level?: EmployeeLevel;
    warehouse_role?: WarehouseRole;
    display_order?: number;
    is_active?: boolean;
  }) => postJson<Employee>(toApiUrl("/api/employees"), payload),

  updateEmployee: async (
    employeeId: string,
    payload: {
      name?: string;
      role?: string;
      phone?: string;
      department?: Department;
      level?: EmployeeLevel;
      warehouse_role?: WarehouseRole;
      display_order?: number;
      is_active?: boolean;
    },
  ) => {
    const res = await fetch(toApiUrl(`/api/employees/${employeeId}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<Employee>;
  },

  deleteEmployee: async (employeeId: string): Promise<{ result: "deleted" | "deactivated" }> => {
    const res = await fetch(toApiUrl(`/api/employees/${employeeId}`), { method: "DELETE" });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<{ result: "deleted" | "deactivated" }>;
  },

  // 작업자 식별용 PIN 검증 — 실제 보안 인증이 아님
  verifyEmployeePin: async (employeeId: string, pin: string) => {
    const res = await fetch(toApiUrl(`/api/employees/${employeeId}/verify-pin`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<Employee>;
  },

  // 직원 PIN을 0000으로 초기화 — 관리자 PIN 검증 필요
  resetEmployeePin: async (employeeId: string, adminPin: string) => {
    const res = await fetch(toApiUrl(`/api/employees/${employeeId}/reset-pin`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin_pin: adminPin }),
    });
    if (!res.ok) throw new Error(await parseError(res));
  },
};
