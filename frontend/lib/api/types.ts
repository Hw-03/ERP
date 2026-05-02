/**
 * DEXCOWIN MES — API 타입 정의 정본.
 *
 * Round-4 (R4-2) 에서 frontend/lib/api.ts 로부터 분리.
 * 외부 호환을 위해 frontend/lib/api.ts 가 모든 타입을 re-export 한다.
 *
 * 새 코드는 다음 중 하나로 import:
 *   import type { Item, TransactionType } from "@/lib/api/types";
 *   import type { Item, TransactionType } from "@/lib/api/index";
 *   import type { Item, TransactionType } from "@/lib/api";  // 호환 유지
 */

export type ProcessTypeCode =
  | "TR" | "TA" | "TF"
  | "HR" | "HA" | "HF"
  | "VR" | "VA" | "VF"
  | "NR" | "NA" | "NF"
  | "AR" | "AA" | "AF"
  | "PR" | "PA" | "PF";

export type TransactionType =
  | "RECEIVE"
  | "PRODUCE"
  | "SHIP"
  | "ADJUST"
  | "BACKFLUSH"
  | "SCRAP"
  | "LOSS"
  | "DISASSEMBLE"
  | "RETURN"
  | "RESERVE"
  | "RESERVE_RELEASE"
  | "TRANSFER_TO_PROD"
  | "TRANSFER_TO_WH"
  | "TRANSFER_DEPT"
  | "MARK_DEFECTIVE"
  | "SUPPLIER_RETURN";

export type LocationStatus = "PRODUCTION" | "DEFECTIVE";

export interface InventoryLocationRow {
  department: Department;
  status: LocationStatus;
  quantity: number;
}
export type Department =
  | "조립"
  | "고압"
  | "진공"
  | "튜닝"
  | "튜브"
  | "AS"
  | "연구"
  | "영업"
  | "출하"
  | "기타";
export type EmployeeLevel = "admin" | "manager" | "staff";
export type WarehouseRole = "none" | "primary" | "deputy";

export interface ProcessTypeSummary {
  process_type_code: string;
  label: string;
  item_count: number;
  total_quantity: number;
  warehouse_qty_sum?: number;
  production_qty_sum?: number;
  defective_qty_sum?: number;
}

export interface InventorySummary {
  process_types: ProcessTypeSummary[];
  total_items: number;
  total_quantity: number;
}

export interface ProductModel {
  slot: number;
  symbol: string | null;
  model_name: string | null;
  is_reserved: boolean;
}

export interface DepartmentMaster {
  id: number;
  name: string;
  display_order: number;
  is_active: boolean;
  color_hex: string | null;
}

export interface Item {
  item_id: string;
  item_name: string;
  spec: string | null;
  unit: string;
  quantity: number;
  warehouse_qty: number;
  production_total: number;
  defective_total: number;
  pending_quantity: number;
  available_quantity: number;
  last_reserver_name: string | null;
  location: string | null;
  locations: InventoryLocationRow[];
  barcode: string | null;
  legacy_file_type: string | null;
  legacy_part: string | null;
  legacy_item_type: string | null;
  legacy_model: string | null;
  supplier: string | null;
  min_stock: number | null;
  erp_code: string | null;
  model_symbol: string | null;
  model_slots: number[];
  symbol_slot: number | null;
  process_type_code: string | null;
  option_code: string | null;
  serial_no: number | null;
  created_at: string;
  updated_at: string;
  department: string | null;
}

// =============================================================================
// Queue / Scrap / Loss / Variance / Alerts / Counts (M4-M6)
// =============================================================================

export type QueueBatchType = "PRODUCE" | "DISASSEMBLE" | "RETURN";
export type QueueBatchStatus = "OPEN" | "CONFIRMED" | "CANCELLED";
export type QueueLineDirection = "IN" | "OUT" | "SCRAP" | "LOSS";

export interface QueueLine {
  line_id: string;
  batch_id: string;
  item_id: string;
  erp_code: string | null;
  item_name: string | null;
  direction: QueueLineDirection;
  quantity: number;
  bom_expected: number | null;
  reason: string | null;
  process_stage: string | null;
  included: boolean;
  created_at: string;
}

export interface QueueBatch {
  batch_id: string;
  batch_type: QueueBatchType;
  status: QueueBatchStatus;
  owner_employee_id: string | null;
  owner_name: string | null;
  parent_item_id: string | null;
  parent_item_name: string | null;
  parent_quantity: number | null;
  reference_no: string | null;
  notes: string | null;
  created_at: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
  lines: QueueLine[];
}

export type AlertKind = "SAFETY" | "COUNT_VARIANCE";

export interface StockAlert {
  alert_id: string;
  item_id: string;
  erp_code: string | null;
  item_name: string | null;
  kind: AlertKind;
  threshold: number | null;
  observed_value: number | null;
  message: string | null;
  triggered_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
}

export interface PhysicalCount {
  count_id: string;
  item_id: string;
  erp_code: string | null;
  item_name: string | null;
  counted_qty: number;
  system_qty: number;
  diff: number;
  reason: string | null;
  operator: string | null;
  created_at: string;
}

export interface ScrapLogRow {
  scrap_id: string;
  item_id: string;
  erp_code: string | null;
  item_name: string | null;
  quantity: number;
  process_stage: string | null;
  reason: string;
  batch_id: string | null;
  operator: string | null;
  created_at: string;
}

export interface LossLogRow {
  loss_id: string;
  item_id: string;
  erp_code: string | null;
  item_name: string | null;
  quantity: number;
  batch_id: string | null;
  reason: string;
  operator: string | null;
  created_at: string;
}

export interface VarianceLogRow {
  var_id: string;
  batch_id: string;
  item_id: string;
  erp_code: string | null;
  item_name: string | null;
  bom_expected: number;
  actual_used: number;
  diff: number;
  note: string | null;
  created_at: string;
}

export interface Employee {
  employee_id: string;
  employee_code: string;
  name: string;
  role: string;
  phone: string | null;
  department: Department;
  level: EmployeeLevel;
  /** 창고 결재 역할 — 기본 "none". primary/deputy 만 승인/반려 가능. */
  warehouse_role: WarehouseRole;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  pin_last_changed?: string | null;
  /** true면 기본 PIN(0000) 또는 미설정. false면 직원이 직접 설정한 PIN. */
  pin_is_default?: boolean;
}

// =============================================================================
// Stock requests (작업자 결재 요청 흐름)
// =============================================================================

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

export interface ShipPackageItemDetail {
  package_item_id: string;
  item_id: string;
  erp_code: string | null;
  item_name: string;
  item_process_type_code: string | null;
  item_unit: string;
  quantity: number;
}

export interface ShipPackage {
  package_id: string;
  package_code: string;
  name: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  items: ShipPackageItemDetail[];
}

export interface InventoryMutationResponse {
  inventory_id: string;
  item_id: string;
  quantity: string;
  location: string | null;
  updated_at: string;
}

export interface BOMEntry {
  bom_id: string;
  parent_item_id: string;
  child_item_id: string;
  quantity: number;
  unit: string;
  notes: string | null;
}

export interface BOMDetailEntry {
  bom_id: string;
  parent_item_id: string;
  parent_item_name: string;
  parent_erp_code: string | null;
  child_item_id: string;
  child_item_name: string;
  child_erp_code: string | null;
  quantity: number;
  unit: string;
}

export interface BOMTreeNode {
  item_id: string;
  erp_code: string;
  item_name: string;
  process_type_code: string | null;
  unit: string;
  required_quantity: number;
  current_stock: number;
  children: BOMTreeNode[];
}

export interface TransactionLog {
  log_id: string;
  item_id: string;
  erp_code: string | null;
  item_name: string;
  item_process_type_code: string | null;
  item_unit: string;
  transaction_type: TransactionType;
  quantity_change: number;
  quantity_before: number | null;
  quantity_after: number | null;
  reference_no: string | null;
  produced_by: string | null;
  notes: string | null;
  created_at: string;
  edit_count?: number;  // 3차: 수정 이력 개수 (서버 응답에 포함)
}

/** 거래 수정 이력 (3차 메타 수정 + 4차 수량 보정 공통). */
export interface TransactionEditLog {
  edit_id: string;
  original_log_id: string;
  edited_by_employee_id: string;
  edited_by_name: string;
  reason: string;
  before_payload: string;  // JSON string
  after_payload: string;   // JSON string
  correction_log_id: string | null;
  created_at: string;
}

export interface ProductionCheckComponent {
  erp_code: string | null;
  item_name: string;
  process_type_code: string | null;
  unit: string;
  required: number;
  current_stock: number;
  shortage: number;
  ok: boolean;
}

export interface ProductionCheckResponse {
  item_id: string;
  item_name: string;
  quantity_to_produce: number;
  can_produce: boolean;
  components: ProductionCheckComponent[];
}

export interface ProductionCapacityItem {
  item_id: string;
  item_name: string;
  erp_code: string | null;
  immediate: number;
  maximum: number;
}

export interface ProductionCapacity {
  immediate: number;
  maximum: number;
  limiting_item: string | null;
  top_items: ProductionCapacityItem[];
}

export interface BackflushDetail {
  item_id: string;
  erp_code: string | null;
  item_name: string;
  process_type_code: string | null;
  required_quantity: number;
  stock_before: number;
  stock_after: number;
}

export interface ProductionReceiptResponse {
  success: boolean;
  message: string;
  produced_item_id: string;
  produced_item_name: string;
  produced_quantity: number;
  reference_no: string | null;
  backflushed_components: BackflushDetail[];
  transaction_ids: string[];
}
