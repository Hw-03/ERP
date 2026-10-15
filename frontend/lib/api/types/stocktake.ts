/** Stocktake and correction wire DTOs keep the backend's snake_case names. */
import type { Item } from "./items";

export interface StocktakeMenuVisibility {
  enabled: boolean;
  employee_visible: boolean;
  participant_departments: string[];
  participant_count: number;
}

export type StocktakeInventorySummary = Pick<Item, "quantity" | "warehouse_qty" | "pending_quantity" |
  "department_pending_quantity" | "available_quantity" | "locations" | "defective_breakdown">;

export type StocktakeCommandKind =
  | "round_start_preview" | "round_start" | "target_append_preview" | "target_append"
  | "count_start" | "count_save" | "count_confirm" | "count_resume"
  | "count_abandon" | "count_force_release" | "application_preview" | "application_apply"
  | "application_bulk_preview" | "application_bulk_apply"
  | "round_close_preview" | "round_close" | "correction_request" | "correction_preview"
  | "correction_approve" | "correction_reject" | "correction_withdraw";

export type StocktakeCategory = "normal" | "defect" | "b_grade" | "obsolete";
export type StocktakeQuantities = Record<StocktakeCategory, number | null>;
export type ConfirmedQuantities = Record<StocktakeCategory, number>;
export type StocktakeRoundStatus = "ACTIVE" | "CLOSED_FULL" | "CLOSED_PARTIAL";
export type StocktakeCountStatus = "DRAFT" | "CONFIRMED" | "APPLIED" | "ABANDONED" | "CLOSED_UNAPPLIED";

export interface StocktakeRound {
  round_id: string;
  title: string;
  status: StocktakeRoundStatus;
  epoch: number;
  target_generation: number;
  started_by: string;
  started_at: string;
  closed_at: string | null;
}

export interface StocktakeCount {
  count_id: string;
  round_id: string;
  target_id: string;
  status: StocktakeCountStatus;
  version: number;
  fence: number;
  owner_id: string;
  owner_name: string;
  quantities: StocktakeQuantities;
  confirmation_revision_id: string | null;
  confirmed_at?: string | null;
  event_id: string | null;
  receipt_id?: string;
  previous_count_id?: string | null;
}

export interface StocktakeTarget {
  target_id: string;
  item_id: string;
  scope_id: string;
  item_code: string | null;
  item_name: string;
  unit: string;
  scope_name: string;
  current_item_code: string | null;
  current_item_name: string;
  target_version: number;
  version: number;
  fence: number;
  status: StocktakeCountStatus | "UNCOUNTED";
  quantities: StocktakeQuantities | null;
  confirmation_revision_id: string | null;
  count: StocktakeCount | null;
  current_inventory?: StocktakeInventorySummary;
  /** Grouped rows retain separate count identities for code location and warehouse. */
  location_targets?: StocktakeTarget[];
  /** Immutable confirmation event's actor; a draft has no confirmer. */
  confirmed_name?: string | null;
  /** Waiting endpoints authorize the exact owned revision, independently of the row's other locations. */
  waiting_eligible?: boolean;
}

export interface StocktakePage<T> {
  items: T[];
  next_cursor: string | null;
  total_items?: number;
}

export interface StocktakeWaitingSelection {
  items: StocktakeTarget[];
  total_items: number;
}

export interface StocktakePreview {
  preview_id: string;
  preview_hash: string;
  expires_at: string;
  receipt_id?: string;
  [key: string]: unknown;
}

export interface StocktakeItemSummary {
  total: number;
  confirmed: number;
  applied: number;
  unconfirmed: number;
}

/** Limited closing snapshot readable by any authenticated operator. */
export interface StocktakeLatestRoundSummary {
  round_id: string;
  title: string;
  status: "CLOSED_FULL" | "CLOSED_PARTIAL";
  closed_at: string | null;
  item_summary: StocktakeItemSummary | null;
}

export interface StocktakeLatestSummaryResponse {
  summary: StocktakeLatestRoundSummary | null;
}

export interface StocktakeProgressSummary {
  total: number;
  confirmed: number;
  applied: number;
  selected: number;
  unconfirmed: number;
  confirmed_excluded: number;
  held: number;
  pending: number;
}

/** Live rounds use current totals; closed rounds retain the closing snapshot. */
export interface StocktakeProgress {
  round_id: string;
  status: StocktakeRoundStatus;
  manifest_id?: string;
  summary: StocktakeProgressSummary;
  item_summary?: StocktakeItemSummary;
  my_waiting?: { items: number; locations: number };
  by_scope: Array<StocktakeProgressSummary & { scope_id: string; scope_name: string }>;
  by_employee: Array<StocktakeProgressSummary & { owner_id: string; owner_name: string }>;
  worker_items?: Array<{ owner_id: string; owner_name: string; surveyed: number; confirmed: number; applied: number;
    quantities_by_unit?: Array<{ unit: string; surveyed: number | null; confirmed: number | null; applied: number | null }>;
  }>;
}

export interface StocktakeClosePreview extends StocktakePreview {
  round_id: string;
  manifest_id: string;
  mode: "FULL" | "PARTIAL";
  reason: string;
  summary: StocktakeProgressSummary;
  item_summary?: StocktakeItemSummary;
  can_close: boolean;
}

export interface StocktakeCloseResult {
  round_id: string;
  status: Exclude<StocktakeRoundStatus, "ACTIVE">;
  manifest_id: string;
  applications: Array<Record<string, unknown>>;
  summary: StocktakeProgressSummary;
  item_summary?: StocktakeItemSummary;
  by_scope: Array<Record<string, unknown>>;
  by_employee: Array<Record<string, unknown>>;
  receipt_id: string;
}

export interface StocktakeEvent {
  item_name?: string | null;
  item_code?: string | null;
  scope_name?: string | null;
  unit?: string | null;
  event_id: string;
  count_id: string | null;
  kind: string;
  actor_id: string;
  actor_name: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface BusinessCorrection {
  correction_id: string;
  version: number;
  status: "REQUESTED" | "APPLIED" | "REJECTED" | "WITHDRAWN";
  atomic_group_key: string;
  scope_hash: string;
  source_type: "InventoryOperation" | "ShippingRequest" | "StockRequest" | "HandoverDoc";
  source_id: string;
  target_status: "PREPARING" | "CANCELLED";
  requester_id: string;
  requester_name: string;
  reason: string;
  evidence: string;
  operation_id: string | null;
  receipt_id?: string;
  scope?: Record<string, unknown>;
}

export interface OperatorSessionIssued {
  token: string;
  expires_at: string;
}

export interface OperatorSessionCurrent {
  employee_id: string;
  employee_code: string;
  employee_name: string;
  tab_id: string;
  expires_at: string;
}
