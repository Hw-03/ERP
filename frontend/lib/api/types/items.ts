/**
 * Items 도메인 타입 — `@/lib/api/types/items`.
 *
 * Round-10A (#2) 본문 이전. ProductModel 은 catalog 보다 items 에 더 자주
 * 사용되어 본 파일에 유지(호환). 향후 catalog 로 옮길 수 있음.
 */

import type { Department, InventoryLocationRow } from "./shared";

export interface Item {
  item_id: string;
  item_name: string;
  unit: string;
  quantity: number;
  warehouse_qty: number;
  production_total: number;
  defective_total: number;
  pending_quantity: number;
  department_pending_quantity?: number;
  available_quantity: number;
  last_reserver_name: string | null;
  location: string | null;
  locations: InventoryLocationRow[];
  legacy_part: string | null;
  legacy_item_type: string | null;
  supplier: string | null;
  supplier_item_code: string | null;
  standard_purchase_price: string | null;
  purchase_price_effective_date: string | null;
  min_stock: number | null;
  reorder_point: number | null;
  procurement_lead_time_days: number | null;
  minimum_order_quantity: number | null;
  purchase_memo: string | null;
  mes_code: string | null;
  model_symbol: string | null;
  model_slots: number[];
  process_type_code: string | null;
  bom_stock_exempt?: boolean;
  sales_review_required?: boolean;
  has_bom?: boolean;
  serial_no: number | null;
  bom_completed_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  department: Department | string | null;
}

export interface ProductModel {
  slot: number;
  symbol: string | null;
  model_name: string | null;
  is_reserved: boolean;
  display_order?: number;
}
