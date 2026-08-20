import type { Department } from "./shared";
import type { ShippingTransactionLog } from "./shipping";

export type IoWorkType =
  | "receive"
  | "warehouse_io"
  | "warehouse_adjust"
  | "process"
  | "defect"
  | "internal_use";

export type IoSubType =
  | "receive_supplier"
  | "warehouse_to_dept"
  | "dept_to_warehouse"
  | "produce"
  | "disassemble"
  | "dept_transfer"
  | "adjust_in"
  | "adjust_out"
  | "warehouse_adjust_in"
  | "warehouse_adjust_out"
  | "defect_quarantine"
  | "defect_restore"
  | "defect_process"
  | "supplier_return"
  | "internal_use_out";

export type IoSourceKind = "direct_item" | "bom_parent" | "manual";
export type IoSourceLocation = "warehouse" | "department";
export type IoInternalUseBomMode = "parent_and_children" | "children_only";
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
  /** 구 이력 응답과의 호환을 위해 optional로 읽는다. */
  bom_stock_exempt?: boolean;
  /** 서버 미리보기에서 발급한 자동 BOM 행 근거. */
  bom_auto_token?: string | null;
  included: boolean;
  /** 화면 체크 상태. 구 응답은 included를 폴백으로 사용한다. */
  selected?: boolean;
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
  internal_use_bom_mode?: IoInternalUseBomMode | null;
  source_location?: IoSourceLocation | null;
  lines: IoLine[];
}

export interface IoComponentSelection {
  item_id: string;
  quantity: number;
  selected: boolean;
}

export interface IoPreviewTarget {
  source_kind: IoSourceKind;
  source_location?: IoSourceLocation | null;
  item_id?: string | null;
  quantity: number;
  internal_use_bom_mode?: IoInternalUseBomMode | null;
  component_selections?: IoComponentSelection[];
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
  status: "draft" | "submitted" | "reserved" | "completed" | "partially_completed" | "rejected" | "cancelled" | "failed";
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
  /** 구 버전 응답과의 호환을 위해 optional로 읽는다. */
  shipping_request_id?: string | null;
  reference_no: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  completed_at: string | null;
  bundles: IoBundle[];
  stock_requests?: IoStockRequestSummary[];
}

export interface IoStockRequestSummary {
  stock_request_id: string;
  request_code: string | null;
  status: string;
  from_bucket: IoBucket;
  from_department: Department | string | null;
  approval_kind: "warehouse" | "department" | "none";
  requires_warehouse_approval: boolean;
  requires_department_approval: boolean;
  approver_employee_id: string | null;
  approver_name: string | null;
  /** 결재 요청이 실제로 반영하는 IoLine. 구 응답에는 없을 수 있다. */
  operation_line_ids?: string[];
}

export interface IoSubmitResponse {
  batch: IoBatch;
  status: IoBatch["status"];
  requires_approval: boolean;
  stock_request_id: string | null;
  stock_requests?: IoStockRequestSummary[];
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
  bom_stock_exempt?: boolean;
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
  requester_employee_id: string;
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
