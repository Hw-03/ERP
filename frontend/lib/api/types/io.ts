import type { Department } from "./shared";
import type { ShippingTransactionLog } from "./shipping";
import type { WorkEffectivePlan, WorkReservationIssue, WorkReservationStatus } from "./work-reservations";

export type IoWorkType =
  | "receive"
  | "tube_material"
  | "warehouse_io"
  | "warehouse_adjust"
  | "process"
  | "defect"
  | "internal_use";

export type IoSubType =
  | "receive_supplier"
  | "outbound_supplier"
  | "tube_receive_supplier"
  | "tube_outbound_supplier"
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
export type IoInternalUseBomMode = "parent_and_children" | "children_only" | "parent_with_returns";
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
  approval_outcome: "approved" | "rejected" | null;
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
  /** 본인 draft 확인 후 그 배치의 작업 예약만 가산한다. 출하 요청 ID와 별개다. */
  owner_batch_id?: string | null;
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
  stocktake_resume_token?: string;
  requester_employee_id: string;
  work_type: IoWorkType;
  sub_type: IoSubType;
  /** 원자재 입출고의 공급·수령 업체 ID. */
  supplier_id?: string | null;
  from_department?: Department | string | null;
  to_department?: Department | string | null;
  reference_no?: string | null;
  notes?: string | null;
  reason_category_id?: string | null;
  reason_category?: string | null;
  client_request_id?: string | null;
  // 이어 작업 중인 draft의 batch_id. 있으면 갱신, 없으면 새 슬롯 생성.
  batch_id?: string | null;
  /** 기존 응답 전환용 optional. CP3 서버는 기존 배치 변경 시 필수로 검증한다. */
  expected_revision?: number;
  bundles: IoBundle[];
}

/** CP5 작성 화면은 생성 키와 수정 버전을 빠뜨리지 않도록 이 계약을 사용한다. */
export type IoReservedDraftPayload = Omit<IoDraftPayload, "batch_id" | "client_request_id" | "expected_revision"> & (
  | { batch_id?: null; client_request_id: string; expected_revision?: never }
  | { batch_id: string; client_request_id?: string | null; expected_revision: number }
);

export interface IoBatch {
  /** 목록에서 방금 재개한 작업의 수량 보존용 UI 힌트. 서버 저장 필드는 아니다. */
  stocktake_resumed?: boolean;
  stocktake_pause?: StocktakeWorkPause | null;
  batch_id: string;
  /** CP3 이전 응답은 미제공. 누락된 버전을 0으로 간주해 변경 요청을 보내지 않는다. */
  revision?: number;
  reservation_status?: WorkReservationStatus;
  reservation_issue?: WorkReservationIssue | null;
  effective_plan?: WorkEffectivePlan | null;
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
  /** 기존 임시저장 경로를 품목코드 기준으로 서버가 갱신했는지 여부. */
  department_routes_normalized?: boolean;
  stock_request_id: string | null;
  /** 구 버전 응답과의 호환을 위해 optional로 읽는다. */
  shipping_request_id?: string | null;
  reference_no: string | null;
  notes: string | null;
  reason_category_id?: string | null;
  reason_category?: string | null;
  /** 레거시 배치는 null일 수 있다. */
  supplier_id?: string | null;
  /** 완료 시점 공급업체명 보존용 스냅샷. */
  supplier_name_snapshot?: string | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  completed_at: string | null;
  bundles: IoBundle[];
  /** 최근 이력의 축약 배치가 표와 같은 작업 분류를 재사용할 때만 전달된다. */
  display_transaction_type?: string | null;
  stock_requests?: IoStockRequestSummary[];
}

/** 관련 품목·위치의 최신 조사 반영 여부에 따라 이어서 작업을 허용한다. */
export interface StocktakeWorkPause {
  token: string;
  round_id: string;
  state: "blocked" | "ready";
  paused_at: string;
  pending_target_count: number;
  missing_target_count: number;
}

export type SupplierScope = "warehouse" | "tube";

export interface Supplier {
  supplier_id: string;
  name: string;
  is_active: boolean;
  /** 필드가 없는 기존 응답은 warehouse로 취급한다. */
  scope?: SupplierScope;
  created_at: string;
  updated_at: string;
}

export interface IoStockRequestSummary {
  stock_request_id: string;
  request_code: string | null;
  status: string;
  from_bucket: IoBucket;
  from_department: Department | string | null;
  approval_kind: "warehouse" | "as_research" | "department" | "none";
  requires_warehouse_approval: boolean;
  requires_as_research_approval: boolean;
  requires_department_approval: boolean;
  approver_employee_id: string | null;
  approver_name: string | null;
  rejected_by_name?: string | null;
  rejected_at?: string | null;
  rejected_reason?: string | null;
  approval_outcome: "approved" | "rejected" | null;
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
