import type { Department } from "./shared";

export type DeptAdjSubType = "production" | "disassembly" | "correction";
export type AdjDirection = "in" | "out" | "defective" | "scrap";
export type AdjSubmitDirection = Exclude<AdjDirection, "scrap">;

export interface AdjLineTemplate {
  item_id: string;
  item_name: string;
  mes_code: string | null;
  process_type_code: string | null;
  unit: string;
  direction: AdjDirection;
  quantity: number;
  bom_expected: number | null;
  bom_parent_item_id?: string | null;
  bom_auto_token?: string | null;
  bom_stock_exempt?: boolean;
  has_children: boolean;
  department: Department;
  reason: string | null;
}

export interface BomTemplateResponse {
  sub_type: DeptAdjSubType;
  lines: AdjLineTemplate[];
}

export interface AdjLineInput {
  item_id: string;
  direction: AdjSubmitDirection;
  quantity: number;
  department: Department;
  reason?: string | null;
  bom_expected?: number | null;
  bom_parent_item_id?: string | null;
  bom_auto_token?: string | null;
}

export interface DeptAdjSubmitPayload {
  sub_type: DeptAdjSubType;
  lines: AdjLineInput[];
  operator_name?: string | null;
  operator_employee_code: string;
  reference_no?: string | null;
  notes?: string | null;
}

export interface DeptAdjResult {
  success: boolean;
  message: string;
  processed_count: number;
  transaction_ids: string[];
}
