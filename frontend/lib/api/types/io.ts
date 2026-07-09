import type { Department } from "./shared";
import type { ShippingTransactionLog } from "./shipping";

export type IoWorkType = "receive" | "warehouse_io" | "process" | "defect";

export type IoSubType =
  | "receive_supplier"
  | "warehouse_to_dept"
  | "dept_to_warehouse"
  | "produce"
  | "disassemble"
  | "dept_transfer"
  | "adjust_in"
  | "adjust_out"
  | "defect_quarantine"
  | "defect_restore"
  | "defect_process"
  | "supplier_return";

export type IoSourceKind = "direct_item" | "bom_parent" | "manual";
export type IoLineOrigin = "direct" | "bom_auto" | "package_auto" | "manual";
export type IoLineDirection = "in" | "out" | "move" | "defective" | "adjust";
export type IoBucket = "warehouse" | "production" | "defective" | "none";

export interface IoLine {
  line_id: string;
  item_id: string;
  item_name: string;
  mes_code: string | null;
  unit: string;
  direction: IoLineDirection;
  from_bucket: IoBucket;
  from_department: Department | string | null;
  to_bucket: IoBucket;
  to_department: Department | string | null;
  quantity: number;
  bom_expected: number | null;
  included: boolean;
  origin: IoLineOrigin;
  edited: boolean;
  has_children: boolean;
  shortage: number;
  exclusion_note: string | null;
}

export interface IoBundle {
  bundle_id: string;
  source_kind: IoSourceKind;
  title: string;
  source_item_id: string | null;
  source_mes_code: string | null;
  quantity: number;
  expanded_level: number;
  lines: IoLine[];
}

export interface IoPreviewTarget {
  source_kind: IoSourceKind;
  item_id?: string | null;
  quantity: number;
}

export interface IoPreviewPayload {
  requester_employee_id?: string | null;
  work_type: IoWorkType;
  sub_type: IoSubType;
  from_department?: Department | string | null;
  to_department?: Department | string | null;
  targets: IoPreviewTarget[];
}

export interface IoPreviewResponse {
  work_type: IoWorkType;
  sub_type: IoSubType;
  requires_approval: boolean;
  bundles: IoBundle[];
}

export interface IoDraftPayload {
  requester_employee_id: string;
  work_type: IoWorkType;
  sub_type: IoSubType;
  from_department?: Department | string | null;
  to_department?: Department | string | null;
  reference_no?: string | null;
  notes?: string | null;
  client_request_id?: string | null;
  // 이어 작업 중인 draft의 batch_id. 있으면 갱신, 없으면 새 슬롯 생성.
  batch_id?: string | null;
  bundles: IoBundle[];
}

export interface IoBatch {
  batch_id: string;
  work_type: IoWorkType;
  sub_type: IoSubType;
  status: "draft" | "submitted" | "reserved" | "completed" | "rejected" | "cancelled" | "failed";
  requester_employee_id: string;
  requester_name: string;
  requester_department: Department | string;
  /** 승인자(요청을 수락한 사람). 직접 처리 시 = 요청자. */
  approver_employee_id: string | null;
  approver_name: string | null;
  from_department: Department | string | null;
  to_department: Department | string | null;
  requires_approval: boolean;
  stock_request_id: string | null;
  reference_no: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  completed_at: string | null;
  bundles: IoBundle[];
}

export interface IoSubmitResponse {
  batch: IoBatch;
  status: IoBatch["status"];
  requires_approval: boolean;
  stock_request_id: string | null;
  message: string;
}

export type ItemConversionMode = "SPEC" | "BOM";

export interface ItemConversionLine {
  item_id: string;
  item_name: string;
  mes_code: string | null;
  process_type_code: string | null;
  source_quantity: number;
  target_quantity: number;
  delta_per_unit: number;
  total_delta: number;
  unit: string;
  department: string | null;
  current_quantity: number;
  available_quantity: number;
  shortage_quantity: number;
  line_kind: "consume" | "recover" | string | null;
}

export interface ItemConversionPreview {
  request_id: string | null;
  requested_mode: ItemConversionMode;
  resolved_mode: ItemConversionMode;
  executable: boolean;
  blocking_reason: string | null;
  source_item_id: string;
  source_item_name: string;
  source_mes_code: string | null;
  target_item_id: string;
  target_item_name: string;
  target_mes_code: string | null;
  quantity: number;
  source_department: string | null;
  source_current_quantity: number;
  source_available_quantity: number;
  source_shortage_quantity: number;
  lines: ItemConversionLine[];
}

export interface ItemConversionPayload {
  source_item_id: string;
  target_item_id: string;
  quantity: number;
  requested_mode?: ItemConversionMode | null;
  memo?: string | null;
}

export interface ItemConversionResult extends ItemConversionPreview {
  reference_no: string;
  memo: string | null;
  completed_at: string;
  transactions: ShippingTransactionLog[];
}
