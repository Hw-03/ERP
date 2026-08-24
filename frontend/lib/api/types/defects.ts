/**
 * 불량 처리 허브 도메인 타입 — `@/lib/api/types/defects`.
 * Phase 2 백엔드 API 와 1:1 대응.
 */

export interface DefectLocation {
  record_id: string;
  item_id: string;
  item_name: string;
  mes_code: string | null;
  department: string;
  quantity: number | string;
  original_quantity: number | string;
  pending_quantity: number | string;
  available_quantity: number | string;
  defective_at: string | null; // ISO 8601 datetime string. 레거시 데이터로 NULL 가능 — UI 방어 필수.
  reason_category?: string | null;
  reason_memo?: string | null;
  quarantined_by?: string | null;
  quarantined_by_employee_id?: string | null;
  is_legacy: boolean;
  /** BOM 자식 보유 여부. 격리 처리 "재작업" 옵션 노출 조건. */
  has_bom: boolean;
}

export interface DefectKpi {
  quarantined: number;
  over_one_year: number;
}

export interface QuarantinePayload {
  item_id: string;
  qty: number;
  source: "warehouse" | "production";
  source_dept?: string;
  target_dept: string;
  reason_category?: string | null;
  reason_memo: string;
  actor_employee_id: string;
  client_request_id?: string;
}

export interface UnquarantinePayload {
  record_id: string;
  item_id: string;
  qty: number;
  dept: string;
  reason_category?: string | null;
  reason_memo?: string | null;
  actor_employee_id: string;
}

export interface DefectMemoUpdatePayload {
  memo: string;
  actor_employee_id: string;
  pin: string;
}

export interface DefectMemoUpdateResult {
  memo: string;
  changed: boolean;
}

export interface DefectMemoRevision {
  revision_id: string;
  previous_memo: string | null;
  next_memo: string | null;
  edited_by_employee_id: string | null;
  edited_by_name: string;
  edited_at: string;
  is_initial: boolean;
}
