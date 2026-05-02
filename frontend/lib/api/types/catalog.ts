/**
 * Catalog 도메인 타입 — `@/lib/api/types/catalog`.
 * (ShipPackages + BOM)
 * Round-10A (#2) 본문 이전.
 */

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
