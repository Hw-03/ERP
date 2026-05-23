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
  /**
   * W11: 부서별 입출고 권한.
   * 백엔드 응답에선 항상 boolean. 마이그레이션 이전 클라이언트 fallback 위해 optional.
   */
  io_enabled?: boolean;
}
