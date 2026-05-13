/**
 * Employees 도메인 타입 — `@/lib/api/types/employees`.
 * Round-10A (#2) 본문 이전.
 */

import type { Department, DepartmentRole, EmployeeLevel, WarehouseRole } from "./shared";

export interface Employee {
  employee_id: string;
  employee_code: string;
  name: string;
  role: string;
  phone: string | null;
  department: Department;
  level: EmployeeLevel;
  /** 창고 결재 역할 — 기본 "none". primary/deputy 만 창고 흐름 승인/반려 가능. */
  warehouse_role: WarehouseRole;
  /** 부서 결재 역할 — 낱개(manual/adjust) 입출고 작업 승인 권한. warehouse_role 와 별개. */
  department_role: DepartmentRole;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  pin_last_changed?: string | null;
  /** true면 기본 PIN(0000) 또는 미설정. false면 직원이 직접 설정한 PIN. */
  pin_is_default?: boolean;
  /** 조립 부서 직원의 담당 모델 slot 목록. 배열 순서 = 우선순위 (앞=상위). */
  assigned_model_slots?: number[];
}
