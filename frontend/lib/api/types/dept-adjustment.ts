import type { Department } from "./shared";

export type DeptAdjSubType = "production" | "disassembly" | "correction";
export type AdjDirection = "in" | "out" | "defective" | "scrap";

export interface AdjLineTemplate {
  item_id: string;
  item_name: string;
  mes_code: string | null;
  process_type_code: string | null;
  unit: string;
  direction: AdjDirection;
  quantity: number;
  bom_expected: number | null;
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
  direction: AdjDirection;
  quantity: number;
  department: Department;
  reason?: string | null;
  bom_expected?: number | null;
}

export interface DeptAdjSubmitPayload {
  sub_type: DeptAdjSubType;
  lines: AdjLineInput[];
  operator_name?: string | null;
  reference_no?: string | null;
  notes?: string | null;
}

export interface DeptAdjResult {
  success: boolean;
  message: string;
  processed_count: number;
  transaction_ids: string[];
}
