/**
 * Operations 도메인 타입 — `@/lib/api/types/operations`.
 * (Alerts, PhysicalCounts, Scrap/Loss/Variance)
 * Round-10A (#2) 본문 이전.
 */

export type AlertKind = "SAFETY" | "COUNT_VARIANCE";

export interface StockAlert {
  alert_id: string;
  item_id: string;
  erp_code: string | null;
  item_name: string | null;
  kind: AlertKind;
  threshold: number | null;
  observed_value: number | null;
  message: string | null;
  triggered_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
}

export interface PhysicalCount {
  count_id: string;
  item_id: string;
  erp_code: string | null;
  item_name: string | null;
  counted_qty: number;
  system_qty: number;
  diff: number;
  reason: string | null;
  operator: string | null;
  created_at: string;
}

export interface ScrapLogRow {
  scrap_id: string;
  item_id: string;
  erp_code: string | null;
  item_name: string | null;
  quantity: number;
  process_stage: string | null;
  reason: string;
  batch_id: string | null;
  operator: string | null;
  created_at: string;
}

export interface LossLogRow {
  loss_id: string;
  item_id: string;
  erp_code: string | null;
  item_name: string | null;
  quantity: number;
  batch_id: string | null;
  reason: string;
  operator: string | null;
  created_at: string;
}

export interface VarianceLogRow {
  var_id: string;
  batch_id: string;
  item_id: string;
  erp_code: string | null;
  item_name: string | null;
  bom_expected: number;
  actual_used: number;
  diff: number;
  note: string | null;
  created_at: string;
}
