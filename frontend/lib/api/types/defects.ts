/**
 * 불량 처리 허브 도메인 타입 — `@/lib/api/types/defects`.
 * Phase 2 백엔드 API 와 1:1 대응.
 */

export interface DefectLocation {
  item_id: string;
  item_name: string;
  mes_code: string;
  department: string;
  quantity: number;
  defective_at: string | null; // ISO 8601 datetime string. 레거시 데이터로 NULL 가능 — UI 방어 필수.
  reason_category?: string | null;
  reason_memo?: string | null;
  /** BOM 자식 보유 여부. 격리 처리 "재작업" 옵션 노출 조건. */
  has_bom: boolean;
}

export interface DefectKpi {
  quarantined: number;
  over_one_year: number;
  pending_approval: number;
  processed_today: number;
}

export interface QuarantinePayload {
  item_id: string;
  qty: number;
  source: "warehouse" | "production";
  source_dept?: string;
  target_dept: string;
  reason_category: string;
  reason_memo: string;
  actor_employee_id: string;
}

export interface UnquarantinePayload {
  item_id: string;
  qty: number;
  dept: string;
  reason_category: string;
  reason_memo: string;
  actor_employee_id: string;
}
