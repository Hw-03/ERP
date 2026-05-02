/**
 * Stock requests 도메인 타입 — `@/lib/api/types/stock-requests`.
 * (작업자 결재 요청 흐름)
 * Round-10A (#2) 본문 이전.
 */

import type { Department } from "./shared";

export type StockRequestStatus =
  | "draft"
  | "submitted"
  | "reserved"
  | "rejected"
  | "cancelled"
  | "completed"
  | "failed_approval";

export type StockRequestType =
  | "raw_receive"
  | "raw_ship"
  | "warehouse_to_dept"
  | "dept_to_warehouse"
  | "dept_internal"
  | "mark_defective_wh"
  | "mark_defective_prod"
  | "supplier_return"
  | "package_out";

export type RequestBucket = "warehouse" | "production" | "defective" | "none";

export interface StockRequestLine {
  line_id: string;
  request_id: string;
  item_id: string;
  item_name_snapshot: string;
  erp_code_snapshot: string | null;
  quantity: number;
  from_bucket: RequestBucket;
  from_department: Department | null;
  to_bucket: RequestBucket;
  to_department: Department | null;
  status: StockRequestStatus;
  created_at: string;
}

export interface StockRequest {
  request_id: string;
  request_code: string | null;
  requester_employee_id: string;
  requester_name: string;
  requester_department: Department;
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
  cancelled_at: string | null;
  completed_at: string | null;
  reference_no: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  lines: StockRequestLine[];
}

export interface StockRequestCreatePayload {
  requester_employee_id: string;
  request_type: StockRequestType;
  reference_no?: string | null;
  notes?: string | null;
  lines: Array<{
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
  request_type: StockRequestType;
  reference_no?: string | null;
  notes?: string | null;
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
  to_bucket: RequestBucket;
  to_department: Department | null;
  created_at: string;
}
