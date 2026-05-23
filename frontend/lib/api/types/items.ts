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
  available_quantity: number;
  last_reserver_name: string | null;
  location: string | null;
  locations: InventoryLocationRow[];
  legacy_part: string | null;
  legacy_item_type: string | null;
  supplier: string | null;
  min_stock: number | null;
  item_code: string | null;
  model_symbol: string | null;
  model_slots: number[];
  process_type_code: string | null;
  option_code: string | null;
  serial_no: number | null;
  bom_completed_at: string | null;
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
