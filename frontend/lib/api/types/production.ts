/**
 * Production / Transactions 도메인 타입 — `@/lib/api/types/production`.
 * Round-10A (#2) 본문 이전.
 */

import type { TransactionType } from "./shared";

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
