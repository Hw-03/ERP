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
  department: Department | string | null;
}

export interface ProductModel {
  slot: number;
  symbol: string | null;
  model_name: string | null;
  is_reserved: boolean;
}
