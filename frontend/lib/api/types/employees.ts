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
  /**
   * W12-#7: 직원별 입출고 권한. 부서 io_enabled 와 AND 결합되어 입출고 화면 진입 가드.
   * 마이그레이션 이전 응답 호환을 위해 optional (없으면 true 로 간주).
   */
  io_enabled?: boolean;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  pin_last_changed?: string | null;
  /** true면 기본 PIN(0000) 또는 미설정. false면 직원이 직접 설정한 PIN. */
  pin_is_default?: boolean;
  /** 개인별 테마 설정 (light | dark | null). */
  theme?: string | null;
  /** 조립 부서 직원의 담당 모델 slot 목록. 배열 순서 = 우선순위 (앞=상위). */
  assigned_model_slots?: number[];
  /** 직원별 좌측 사이드바/모바일 탭 숨김 목록. 누락 시 []로 간주. */
  hidden_sidebar_tabs?: string[];
}
