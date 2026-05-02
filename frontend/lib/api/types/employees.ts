/**
 * Employees 도메인 타입 — `@/lib/api/types/employees`.
 * Round-10A (#2) 본문 이전.
 */

import type { Department, EmployeeLevel, WarehouseRole } from "./shared";

export interface Employee {
  employee_id: string;
  employee_code: string;
  name: string;
  role: string;
  phone: string | null;
  department: Department;
  level: EmployeeLevel;
  /** 창고 결재 역할 — 기본 "none". primary/deputy 만 승인/반려 가능. */
  warehouse_role: WarehouseRole;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  pin_last_changed?: string | null;
  /** true면 기본 PIN(0000) 또는 미설정. false면 직원이 직접 설정한 PIN. */
  pin_is_default?: boolean;
}
