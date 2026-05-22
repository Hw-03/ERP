/**
 * 불량 처리 허브 도메인 타입 — `@/lib/api/types/defects`.
 * Phase 2 백엔드 API 와 1:1 대응.
 */

export interface DefectLocation {
  item_id: string;
  item_name: string;
  item_code: string;
  department: string;
  quantity: number;
  defective_at: string; // ISO 8601 datetime string
  reason_category?: string | null;
  reason_memo?: string | null;
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
