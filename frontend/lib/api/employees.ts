/**
 * Employees 도메인 API — `@/lib/api/employees`.
 *
 * Round-6 (R6-D2) 분리. 6 메소드:
 *   - getEmployees / createEmployee / updateEmployee / deleteEmployee
 *   - verifyEmployeePin / resetEmployeePin
 *
 * 외부 호환을 위해 `frontend/lib/api.ts` 가 spread merge.
 */

import { deleteJson, fetcher, postJson, putJson, toApiUrl } from "../api-core";
import type { Department, DepartmentRole, Employee, EmployeeLevel, WarehouseRole } from "./types";

export const employeesApi = {
  getEmployees: (params?: { department?: Department; activeOnly?: boolean }) => {
    const query = new URLSearchParams();
    if (params?.department) query.set("department", params.department);
    if (params?.activeOnly !== undefined) query.set("active_only", String(params.activeOnly));
    return fetcher<Employee[]>(toApiUrl(`/api/employees?${query}`));
  },

  createEmployee: (payload: {
    employee_code?: string;
    name: string;
    role: string;
    phone?: string;
    department: Department;
    level?: EmployeeLevel;
    warehouse_role?: WarehouseRole;
    department_role?: DepartmentRole;
    display_order?: number;
    is_active?: boolean;
    /** W12-#7: 직원별 입출고 권한. 부서 io_enabled 와 AND 결합. */
    io_enabled?: boolean;
    /** 조립 부서 직원의 담당 모델 slot 목록 (배열 순서 = 우선순위). */
    assigned_model_slots?: number[];
    /** 직원별 좌측 사이드바/모바일 탭 숨김 목록. */
    hidden_sidebar_tabs?: string[];
  }) => postJson<Employee>(toApiUrl("/api/employees"), payload),

  updateEmployee: (
    employeeId: string,
    payload: {
      name?: string;
      role?: string;
      phone?: string;
      department?: Department;
      level?: EmployeeLevel;
      warehouse_role?: WarehouseRole;
      department_role?: DepartmentRole;
      display_order?: number;
      is_active?: boolean;
      /** W12-#7: 직원별 입출고 권한. */
      io_enabled?: boolean;
      /** 담당 모델 slot 목록. null=변경 없음, []=전부 제거. */
      assigned_model_slots?: number[];
      /** 직원별 좌측 사이드바/모바일 탭 숨김 목록. */
      hidden_sidebar_tabs?: string[];
    },
  ) => putJson<Employee>(toApiUrl(`/api/employees/${employeeId}`), payload),

  deleteEmployee: (employeeId: string) =>
    deleteJson<{ result: "deleted" | "deactivated" }>(toApiUrl(`/api/employees/${employeeId}`)),

  // 작업자 식별용 PIN 검증 — 실제 보안 인증이 아님
  verifyEmployeePin: (employeeId: string, pin: string) =>
    postJson<Employee>(toApiUrl(`/api/employees/${employeeId}/verify-pin`), { pin }),

  // 직원 PIN을 0000으로 초기화 — 관리자 PIN 검증 필요
  resetEmployeePin: (employeeId: string, adminPin: string) =>
    postJson<void>(toApiUrl(`/api/employees/${employeeId}/reset-pin`), { pin: adminPin }),

  // 본인 PIN 변경 — 현재 PIN 검증 필요
  changeMyPin: (employeeId: string, currentPin: string, newPin: string) =>
    postJson<void>(toApiUrl(`/api/employees/${employeeId}/change-pin`), { current_pin: currentPin, new_pin: newPin }),

  // 직원 테마 설정 저장
  setEmployeeTheme: (employeeId: string, theme: string | null) =>
    putJson<Employee>(toApiUrl(`/api/employees/${employeeId}/theme`), { theme }),
};
