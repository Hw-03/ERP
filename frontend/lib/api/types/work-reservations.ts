/** CP1 계약. 새 엔드포인트는 CP4에서 제공하며 수량은 서버가 계산한 정수다. */
import type { IoBatch, IoSubType, IoWorkType } from "./io";
import type { InventoryReservationSummary } from "./inventory";

export type WorkReservationStatus = "reserved" | "not_required" | "inactive";

/** 물리 셀의 위치. 창고는 department=null, 부서는 정확한 부서 코드를 사용한다. */
export type WorkStockLocation =
  | { bucket: "warehouse"; department: null }
  | { bucket: "production" | "defective"; department: string };
export type WorkSourceLocation =
  | { bucket: "warehouse"; department: null }
  | { bucket: "production"; department: string };

export interface WorkItemIdentity {
  item_id: string;
  item_name: string;
  mes_code: string | null;
  unit: string;
}

/** included/BOM 면제/커스텀 BOM/경로 정규화를 마친 실제 효과만 담는다. */
export type WorkInventoryEffect = WorkItemIdentity & {
  effect_id: string;
  operation_line_id: string;
  bundle_id: string;
  quantity: number;
} & (
  | { kind: "out"; from: WorkSourceLocation; to: null }
  | { kind: "in"; from: null; to: WorkStockLocation }
  | { kind: "move"; from: WorkSourceLocation; to: WorkStockLocation }
);

export interface WorkEffectivePlan {
  version: 1;
  fingerprint: string;
  effects: WorkInventoryEffect[];
}

export interface WorkReservationShortage extends WorkItemIdentity {
  location: WorkSourceLocation;
  required_quantity: number;
  /** 해당 배치의 기존 예약을 재사용한 가용량. 미래 입고는 포함하지 않는다. */
  available_quantity: number;
  shortage_quantity: number;
}

export interface WorkReservationIssue {
  code: "stock_shortage" | "inactive_owner" | "unsupported_source" | "plan_invalid" | "returned_after_rejection";
  message: string;
  shortages: WorkReservationShortage[];
}

export interface WorkReservedInput extends WorkItemIdentity {
  location: WorkSourceLocation;
  quantity: number;
  source: "draft" | "approval";
  stock_request_id: string | null;
  operation_line_ids: string[];
}

export interface WorkTarget extends WorkItemIdentity {
  quantity: number;
}

export interface WorkReservationSummary {
  batch_id: string;
  revision: number;
  status: IoBatch["status"];
  reservation_status: WorkReservationStatus;
  reservation_issue: WorkReservationIssue | null;
  work_type: IoWorkType;
  sub_type: IoSubType;
  reference_no: string | null;
  requester_employee_id: string;
  requester_name: string;
  requester_department: string;
  requester_active: boolean;
  targets: WorkTarget[];
  created_at: string;
  updated_at: string;
}

/** 공개 조회는 열린 효과만 제공하며 관리자 취소 이력은 포함하지 않는다. */
export interface InventoryRelatedWork extends WorkReservationSummary {
  reserved_inputs: WorkReservedInput[];
  expected_effects: WorkInventoryEffect[];
  forecast_issue: { code: "missing_effect_mapping" | "unsupported_legacy_plan"; message: string } | null;
}

export interface InventoryWorkStatus {
  item_id: string;
  summary: InventoryReservationSummary;
  works: InventoryRelatedWork[];
}

export interface WorkReservationEvent {
  event_id: string;
  action: "saved" | "submitted" | "returned" | "backfilled" | "admin_cancelled" | "owner_deleted" | "approval_changed" | "settlement_failed";
  revision: number;
  occurred_at: string;
  actor_employee_id: string | null;
  actor_name: string;
  reason: string | null;
}

export interface AdminWorkReservationDetail extends InventoryRelatedWork {
  notes: string | null;
  effective_plan: WorkEffectivePlan | null;
  history: WorkReservationEvent[];
}

export interface AdminWorkReservationFilters {
  search?: string;
  requester_department?: string;
  requester_employee_id?: string;
  skip?: number;
  limit?: number;
}

export interface AdminWorkReservationList {
  items: WorkReservationSummary[];
  total: number;
  skip: number;
  limit: number;
}

export interface AdminWorkReservationCancelPayload {
  expected_revision: number;
  reason: string;
}

/** ApiError.code. 상세는 extra에 있고, 충돌/부족 응답에서 쓰기를 자동 재시도하지 않는다. */
export type WorkReservationErrorCode =
  | "WORK_REVISION_CONFLICT"
  | "WORK_STATE_CONFLICT"
  | "WORK_PLAN_CHANGED"
  | "WORK_CREATE_KEY_CONFLICT"
  | "WORK_RESAVE_REQUIRED"
  | "WORK_UNSUPPORTED_SOURCE"
  | "IO_SETTLEMENT_FAILED_PERSISTED"
  | "WORK_APPROVAL_FAILED_PERSISTED"
  | "STOCK_SHORTAGE"
  | "BAD_REQUEST"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR";
