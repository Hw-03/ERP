/**
 * Production / Transactions 도메인 타입 — `@/lib/api/types/production`.
 * Round-10A (#2) 본문 이전.
 */

import type { TransactionType } from "./shared";

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
  notes: string | null;
  operation_batch_id: string | null;
  created_at: string;
  /** 3차: 수정 이력 개수 (서버 응답에 포함). */
  edit_count?: number;
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

export interface ProductionCapacity {
  immediate: number;
  maximum: number;
  limiting_item: string | null;
  /** 표시 분기용. 선택 필드 — 백엔드 미배포/오래된 응답을 위한 fallback 허용. */
  status?: ProductionCapacityStatus;
  top_items: ProductionCapacityItem[];
  /** 모델별 대표 PF 만 골라낸 리스트. 패널/모달 상단 표시용. */
  representative_items?: ProductionCapacityItem[];
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
