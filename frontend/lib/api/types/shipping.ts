import type { TransactionType } from "./shared";

export type ShippingRequestStatus = "REQUESTED" | "PREPARING" | "PREPARED" | "PICKED_UP";
export type ShippingBomParentStage = "PA" | "PF";
export type ShippingBomLineOrigin = "DEFAULT" | "CUSTOM";

export interface ShippingBomLineInput {
  parent_stage: ShippingBomParentStage;
  child_item_id: string;
  quantity: number;
  unit?: string;
  included?: boolean;
  origin?: ShippingBomLineOrigin;
}

export interface ShippingCompanionLineInput {
  item_id: string;
  quantity: number;
  unit?: string;
}

export interface ShippingRequestCreatePayload {
  base_pf_item_id: string;
  request_quantity?: number;
  requested_by_name?: string | null;
  custom_pa_name?: string | null;
  custom_pf_name?: string | null;
  notes?: string | null;
  bom_lines?: ShippingBomLineInput[] | null;
  companion_lines?: ShippingCompanionLineInput[] | null;
}

export interface ShippingRequestUpdatePayload {
  request_quantity?: number;
  requested_by_name?: string | null;
  custom_pa_name?: string | null;
  custom_pf_name?: string | null;
  notes?: string | null;
  bom_lines?: ShippingBomLineInput[] | null;
  companion_lines?: ShippingCompanionLineInput[] | null;
}

export interface ShippingChecklistUpdatePayload {
  checks: Array<{ item_id: string; checked: boolean }>;
}

export interface ShippingPrepareCompletePayload {
  companion_lines?: ShippingCompanionLineInput[];
}

export interface ShippingPrepareCancelPayload {
  reason?: string | null;
}

export interface ShippingComponentChangeExecutePayload {
  source_pa_item_id: string;
  target_pa_item_id?: string;
  quantity: number;
  memo?: string | null;
}

export interface ShippingComponentChangeLine {
  item_id: string;
  item_name: string;
  mes_code: string | null;
  process_type_code: string | null;
  source_quantity: number;
  target_quantity: number;
  delta_per_unit: number;
  total_delta: number;
  unit: string;
  department: string | null;
  current_quantity: number;
  available_quantity: number;
  shortage_quantity: number;
}

export interface ShippingComponentChangePreview {
  request_id: string | null;
  source_item_id: string;
  source_item_name: string;
  source_mes_code: string | null;
  target_item_id: string;
  target_item_name: string;
  target_mes_code: string | null;
  quantity: number;
  source_department: string | null;
  source_current_quantity: number;
  source_available_quantity: number;
  source_shortage_quantity: number;
  lines: ShippingComponentChangeLine[];
}

export interface ShippingComponentChangeResult extends ShippingComponentChangePreview {
  reference_no: string;
  memo: string | null;
  completed_at: string;
  transactions: ShippingTransactionLog[];
}
export interface ShippingBomLine {
  line_id: string;
  parent_stage: ShippingBomParentStage;
  child_item_id: string;
  item_name: string;
  mes_code: string | null;
  process_type_code: string | null;
  quantity: number;
  unit: string;
  included: boolean;
  origin: ShippingBomLineOrigin;
}

export interface ShippingCompanionLine {
  line_id: string;
  item_id: string;
  item_name: string;
  mes_code: string | null;
  process_type_code: string | null;
  quantity: number;
  unit: string;
}

export interface ShippingChecklistLine {
  line_id: string;
  item_id: string;
  item_name: string;
  mes_code: string | null;
  process_type_code: string | null;
  quantity: number;
  checked: boolean;
}

export interface ShippingEvent {
  event_id: string;
  event_type: string;
  message: string | null;
  created_at: string;
}

export interface ShippingAllocation {
  allocation_id: string;
  request_id: string;
  item_id: string;
  item_name: string;
  mes_code: string | null;
  process_type_code: string | null;
  quantity: number;
  unit: string;
  department: string | null;
  status: "RESERVED" | "RELEASED" | "CONSUMED" | string;
  reference_no: string | null;
  created_at: string;
  released_at: string | null;
  consumed_at: string | null;
  released_reason: string | null;
}

export interface ShippingStockShortage {
  item_id: string;
  item_name: string;
  mes_code: string | null;
  process_type_code: string | null;
  department: string | null;
  required_quantity: number;
  current_quantity: number;
  allocated_quantity: number;
  available_quantity: number;
  shortage_quantity: number;
  phase: "PREPARE" | "PICKUP" | string;
}

export interface ShippingTransactionLog {
  log_id: string;
  item_id: string;
  item_name: string;
  mes_code: string | null;
  item_process_type_code: string | null;
  transaction_type: TransactionType;
  quantity_change: number;
  quantity_before: number | null;
  quantity_after: number | null;
  warehouse_qty_before: number | null;
  warehouse_qty_after: number | null;
  reference_no: string | null;
  produced_by: string | null;
  notes: string | null;
  shipping_phase: "PREPARE" | "PICKUP" | string | null;
  created_at: string;
  cancelled: boolean;
  cancel_reason: string | null;
  cancelled_at: string | null;
  inventory_effect: Array<Record<string, unknown>> | null;
}
export interface ShippingRequest {
  request_id: string;
  status: ShippingRequestStatus;
  base_pf_item_id: string;
  base_pf_item_name: string;
  base_pf_mes_code: string | null;
  request_quantity: number;
  final_pa_item_id: string | null;
  final_pa_item_name: string | null;
  final_pf_item_id: string | null;
  final_pf_item_name: string | null;
  requested_by_name: string | null;
  custom_pa_name: string | null;
  custom_pf_name: string | null;
  notes: string | null;
  prepared_at: string | null;
  picked_up_at: string | null;
  created_at: string;
  updated_at: string;
  bom_lines: ShippingBomLine[];
  companion_lines: ShippingCompanionLine[];
  checklist_lines: ShippingChecklistLine[];
  events: ShippingEvent[];
  transactions: ShippingTransactionLog[];
  allocations: ShippingAllocation[];
  stock_shortages: ShippingStockShortage[];
  transaction_count: number;
}

export interface ShippingBomMatchResponse {
  matched_pa_item_id: string | null;
  matched_pf_item_id: string | null;
  matched_pa_item_name: string | null;
  matched_pf_item_name: string | null;
  requires_pa_name: boolean;
  requires_pf_name: boolean;
}
