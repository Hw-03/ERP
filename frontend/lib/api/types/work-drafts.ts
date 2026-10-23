import type { IoSubType, IoWorkType } from "./io";
import type { TransactionType } from "./shared";
import type { InventoryRelatedWork, WorkReservationIssue, WorkReservationStatus, WorkReservedInput, WorkInventoryEffect } from "./work-reservations";

export type WorkDraftKind = "io" | "stock_request";
export interface WorkDraftCount { io_count: number; stock_request_count: number; total: number }
export interface WorkDraftSelection { kind: WorkDraftKind; id: string }

export interface WorkDraftMovementSummary { increase: number; decrease: number; move: number }

/** 구형 저장 행은 품목이 사라져도 저장된 이름과 수량으로 확인한다. */
export interface WorkDraftTarget {
  item_id: string | null;
  item_name: string;
  mes_code: string | null;
  unit: string;
  quantity: number;
}

export interface WorkDraftSummary extends WorkDraftSelection {
  requester_employee_id: string;
  requester_name: string;
  requester_department: string;
  requester_active: boolean;
  work_type: IoWorkType | null;
  sub_type: IoSubType | null;
  request_type: string | null;
  notes: string | null;
  /** 완료 내역과 같은 분류를 위한 공개 정보. 구 응답에서는 없을 수 있다. */
  history_operation?: { transaction_type: TransactionType; department: string | null } | null;
  targets: WorkDraftTarget[];
  movement_summary: WorkDraftMovementSummary | null;
  created_at: string;
  updated_at: string;
}

/** null은 이 저장 형식에서 예약·예정 정보를 확인할 수 없다는 뜻이다. */
export interface WorkDraftDetail extends WorkDraftSummary {
  reservation_status: WorkReservationStatus | null;
  reservation_issue: WorkReservationIssue | null;
  reserved_inputs: WorkReservedInput[] | null;
  expected_effects: WorkInventoryEffect[] | null;
  forecast_issue: InventoryRelatedWork["forecast_issue"];
}

export interface WorkDraftFilters {
  sort?: "updated_desc" | "updated_asc" | "department";
  search?: string;
  requester_department?: string;
  requester_employee_id?: string;
  skip?: number;
  limit?: number;
}

export interface WorkDraftList {
  items: WorkDraftSummary[];
  total: number;
  skip: number;
  limit: number;
}
