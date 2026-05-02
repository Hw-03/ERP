/**
 * 공통 / cross-domain 타입 — `@/lib/api/types/shared`.
 *
 * 5개 이상 도메인이 참조하는 8종을 정본으로 보관.
 * Round-10A (#2) 에서 types.ts 본문 이전 — 도메인 파일들이 본 파일에서 import.
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

export interface InventoryLocationRow {
  department: Department;
  status: LocationStatus;
  quantity: number;
}

export interface ProcessTypeSummary {
  process_type_code: string;
  label: string;
  item_count: number;
  total_quantity: number;
  warehouse_qty_sum?: number;
  production_qty_sum?: number;
  defective_qty_sum?: number;
}
