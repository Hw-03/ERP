/**
 * Production / Transactions 도메인 타입 — `@/lib/api/types/production`.
 * Round-10A (#2) 본문 이전.
 */

import type { TransactionType } from "./shared";

export interface InventoryEffectCell {
  scope: string;
  delta: number | string;
  department?: string | null;
  status?: string | null;
  box_id?: string | null;
}

export interface TransactionLog {
  log_id: string;
  item_id: string;
  mes_code: string | null;
  item_name: string;
  item_process_type_code: string | null;
  item_unit: string;
  transaction_type: TransactionType;
  quantity_change: number;
  quantity_before: number | null;
  quantity_after: number | null;
  warehouse_qty_before: number | null;
  warehouse_qty_after: number | null;
  transfer_qty: number | null;
  reference_no: string | null;
  produced_by: string | null;
  requester_name: string | null;
  /** 승인자(요청을 수락한 사람). 직접 처리 시 = 요청자. */
  approver_name: string | null;
  /** 요청 시각: 배치 submitted_at ?? created_at, 없으면 log.created_at. */
  requested_at?: string | null;
  /** 승인 시각: 별도 결재 시 StockRequest.approved_at, 아니면 log.created_at. */
  approved_at?: string | null;
  department: string | null;
  notes: string | null;
  reason_category?: string | null;
  reason_memo?: string | null;
  operation_batch_id: string | null;
  created_at: string;
  edit_count?: number;
  cancelled: boolean;
  cancel_reason: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  inventory_effect?: InventoryEffectCell[] | null;
}

/** 거래 수정 이력 (3차 메타 수정 + 4차 수량 보정 공통). */
export interface TransactionEditLog {
  edit_id: string;
  original_log_id: string;
  edited_by_employee_id: string;
  edited_by_name: string;
  reason: string;
  before_payload: string; // JSON string
  after_payload: string; // JSON string
  correction_log_id: string | null;
  created_at: string;
}

export interface ProductionCheckComponent {
  mes_code: string | null;
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

export type ProductionCapacityStatus =
  | "no_target"
  | "bom_not_registered"
  | "not_producible"
  | "producible";

export interface ProductionCapacityItem {
  item_id: string;
  item_name: string;
  mes_code: string | null;
  /** 모델 식별자(items.model_symbol). 그룹화·대표 PF 선정 기준. */
  model_symbol?: string | null;
  /** 해당 모델의 대표 PF 여부. */
  is_representative?: boolean;
  immediate: number;
  maximum: number;
  /** 이 완제품의 immediate 를 결정한 직계 자식 병목 부품명. */
  limiting_item?: string | null;
}

/** AF(조립 완제품) 기준 상태. legacy status + "incomplete"(일부 BOM 미등록). */
export type ProductionCapacityAfStatus =
  | "no_target"
  | "bom_not_registered"
  | "incomplete"
  | "not_producible"
  | "producible";

/** PF 기준 요약 3수량. PF 변형별 독립 계산의 합계(공유 자재 시 동시 보장 아님). */
export interface ProductionCapacityAfSummary {
  /** 출하 대기 — 창고에 있는 완성 PF 재고. */
  ship_ready: number;
  /** 빠른 생산 — AF재고 + AF 직계 1단계 부품 → PF 환산 (포장 구간 포함). */
  fast_production: number;
  /** 총생산 — PF 루트로 BOM 전체 재귀 이론 최대. */
  total_production: number;
}

/** AF 1종의 생산 가능 수량 + 병목 + BOM 상태 근거. 수치는 연결된 PF 변형 best 값. */
export interface ProductionCapacityAfItem {
  af_item_id: string;
  af_code: string | null;
  af_name: string;
  model_symbol?: string | null;
  ship_ready: number;
  fast_production: number;
  total_production: number;
  ship_ready_limiting_item?: string | null;
  fast_production_limiting_item?: string | null;
  total_production_limiting_item?: string | null;
  bom_status: "complete" | "incomplete";
  has_direct_children: boolean;
  /** 역방향 BOM 상 출하 경로(PF)가 1개 이상 존재. false 면 모든 수치 0. */
  has_pf_path: boolean;
  /** bom_completed_at 기록 여부(표시 신호 — 계산 게이팅 아님). */
  marked_complete: boolean;
}

/** AF 에 연결된 PF 변형 — PF 1종 기준 3수량. */
export interface ProductionCapacityPfVariant {
  pf_item_id: string;
  pf_code: string | null;
  pf_name: string;
  model_symbol?: string | null;
  af_item_id: string | null;
  /** 출하 대기 — 이 PF 완성 재고. */
  ship_ready: number;
  /** 빠른 생산 — AF재고 + 1단계 부품 → 이 PF로 환산. */
  fast_production: number;
  /** 총생산 — 이 PF 루트로 BOM 전체 재귀 이론 최대. */
  total_production: number;
  fast_production_limiting_item?: string | null;
  total_production_limiting_item?: string | null;
  bom_status: "complete" | "incomplete";
}

/** AF(조립 완제품) 기준 신규 생산 가능 수량 블록. */
export interface ProductionCapacityAfBlock {
  basis: "AF";
  status: ProductionCapacityAfStatus;
  summary: ProductionCapacityAfSummary;
  items: ProductionCapacityAfItem[];
  pf_variants: ProductionCapacityPfVariant[];
}

export interface ProductionCapacity {
  immediate: number;
  maximum: number;
  limiting_item: string | null;
  /** 표시 분기용. 선택 필드 — 백엔드 미배포/오래된 응답을 위한 fallback 허용. */
  status?: ProductionCapacityStatus;
  top_items: ProductionCapacityItem[];
  /** 모델별 대표 PF 만 골라낸 리스트. 패널/모달 상단 표시용. */
  representative_items?: ProductionCapacityItem[];
  /** AF 기준 신규 블록. 있으면 패널·모달이 이걸 우선 표시. 없으면 legacy(immediate/maximum) fallback. */
  af?: ProductionCapacityAfBlock | null;
}

export interface BackflushDetail {
  item_id: string;
  mes_code: string | null;
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
