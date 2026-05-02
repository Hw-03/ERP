/**
 * Departments 도메인 타입 — `@/lib/api/types/departments`.
 * Round-10A (#2) 본문 이전.
 */

export interface DepartmentMaster {
  id: number;
  name: string;
  display_order: number;
  is_active: boolean;
  color_hex: string | null;
}
