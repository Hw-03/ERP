/**
 * Catalog 도메인 타입 — `@/lib/api/types/catalog`.
 * (BOM)
 * Round-10A (#2) 본문 이전.
 */

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
  parent_mes_code: string | null;
  child_item_id: string;
  child_item_name: string;
  child_mes_code: string | null;
  quantity: number;
  unit: string;
}

export interface BOMTreeNode {
  item_id: string;
  mes_code: string;
  item_name: string;
  process_type_code: string | null;
  unit: string;
  required_quantity: number;
  current_stock: number;
  children: BOMTreeNode[];
}
