/**
 * Stock requests 도메인 타입 — `@/lib/api/types/stock-requests`.
 * (작업자 결재 요청 흐름)
 * Round-10A (#2) 본문 이전.
 */

import type { Department } from "./shared";
import type { components } from "../generated/openapi";

export type StockRequestStatus =
  | "draft"
  | "submitted"
  | "reserved"
  | "rejected"
  | "cancelled"
  | "completed"
  | "failed_approval";

export type StockRequestCommandType = components["schemas"]["StockRequestTypeEnum"];
export type StockRequestType = StockRequestCommandType | (string & {});

const STOCK_REQUEST_COMMAND_TYPES = {
  raw_receive: true,
  raw_ship: true,
  warehouse_to_dept: true,
  dept_to_warehouse: true,
  dept_internal: true,
  mark_defective_wh: true,
  mark_defective_prod: true,
  supplier_return: true,
  package_out: true,
  internal_use: true,
  manual_adjustment: true,
  defect_scrap: true,
  defect_return: true,
  defect_disassemble: true,
  scrap_normal: true,
  return_normal: true,
  rework_normal: true,
} satisfies Record<StockRequestCommandType, true>;

/** OpenAPI에 체크인된 요청 유형만 mutation 입력으로 허용한다. */
export function isStockRequestCommandType(value: string): value is StockRequestCommandType {
  return Object.prototype.hasOwnProperty.call(STOCK_REQUEST_COMMAND_TYPES, value);
}

export type RequestBucket = "warehouse" | "production" | "defective" | "none";

export interface StockRequestLine {
  record_id?: string | null;
  line_id: string;
  request_id: string;
  item_id: string;
  item_name_snapshot: string;
  mes_code_snapshot: string | null;
  quantity: number;
  from_bucket: RequestBucket;
  from_department: Department | null;
  to_bucket: RequestBucket;
  to_department: Department | null;
  status: StockRequestStatus;
  operation_line_id?: string | null;
  created_at: string;
}

export interface StockRequest {
  request_id: string;
  request_code: string | null;
  requester_employee_id: string;
  requester_name: string;
  requester_department: Department;
  approval_department?: Department | null;
  request_type: StockRequestType;
  status: StockRequestStatus;
  requires_warehouse_approval: boolean;
  reserved_at: string | null;
  submitted_at: string | null;
  approved_by_employee_id: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  rejected_by_employee_id: string | null;
  rejected_by_name: string | null;
  rejected_at: string | null;
  rejected_reason: string | null;
  requires_department_approval: boolean;
  department_approved_by_employee_id: string | null;
  department_approved_by_name: string | null;
  department_approved_at: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
  reference_no: string | null;
  notes: string | null;
  operation_batch_id: string | null;
  reason_category: string | null;
  reason_memo: string | null;
  created_at: string;
  updated_at: string;
  lines: StockRequestLine[];
}

export interface StockRequestCreatePayload {
  requester_employee_id: string;
  request_type: StockRequestCommandType;
  reference_no?: string | null;
  notes?: string | null;
  reason_category?: string | null;
  reason_memo?: string | null;
  client_request_id?: string;
  lines: Array<{
    record_id?: string | null;
    item_id: string;
    quantity: number;
    from_bucket: RequestBucket;
    from_department?: Department | null;
    to_bucket: RequestBucket;
    to_department?: Department | null;
  }>;
}

export interface StockRequestDraftUpsertPayload {
  requester_employee_id: string;
  request_type: StockRequestCommandType;
  reference_no?: string | null;
  notes?: string | null;
  reason_category?: string | null;
  reason_memo?: string | null;
  lines: StockRequestCreatePayload["lines"];
}

export interface StockRequestActionPayload {
  actor_employee_id: string;
  pin: string;
  reason?: string;
}

export interface StockRequestReservationLine {
  line_id: string;
  request_id: string;
  request_code: string | null;
  requester_name: string;
  requester_department: Department;
  quantity: number;
  from_bucket: RequestBucket;
  from_department?: Department | null;
  to_bucket: RequestBucket;
  to_department: Department | null;
  created_at: string;
}
