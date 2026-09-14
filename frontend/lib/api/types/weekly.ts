export interface WeeklyItemReport {
  item_id: string;
  mes_code: string | null;
  item_name: string;
  prev_qty: number;
  produce_qty: number;
  receive_qty: number;
  out_qty: number;
  defect_qty?: number;
  current_qty: number;
  delta: number;
  activity_evidence?: WeeklyActivityEvidence[];
}

export interface WeeklyGroupReport {
  process_code: string;
  dept_name: string;
  label: string;
  item_count: number;
  prev_qty: number;
  increase_qty: number;
  decrease_qty: number;
  produce_qty: number;
  receive_qty: number;
  out_qty: number;
  defect_qty?: number;
  current_qty: number;
  delta: number;
  items: WeeklyItemReport[];
}

export interface WeeklyWarning {
  level: "danger" | "warn" | "good";
  title: string;
  message: string;
}

export interface WeeklyReportSummary {
  total_current_qty: number;
  total_produce_qty: number;
  total_receive_qty: number;
  total_out_qty: number;
  total_defect_qty?: number;
  groups_increasing: number;
  groups_decreasing: number;
  groups_unchanged: number;
}

export interface WeeklyProductionModelRow {
  model_key: string;
  model_label: string;
  tf_qty: number;
  hf_qty: number;
  vf_qty: number;
  nf_qty: number;
  af_qty: number;
  pf_qty: number;
  total_qty: number;
}

export interface WeeklyReportResponse {
  week_start: string;
  week_end: string;
  groups: WeeklyGroupReport[];
  summary: WeeklyReportSummary;
  warnings: WeeklyWarning[];
  production_matrix: WeeklyProductionModelRow[];
  basis_version?: number;
  report_status?: "legacy" | "transition" | "verified" | "failed";
  transition_notice?: string | null;
  validation?: WeeklyReportValidation;
}

export interface WeeklyActivityEvidence {
  column: "produce" | "receive" | "out" | "defect";
  operation_id: string;
  log_id: string;
  quantity: number;
  label: string;
}

export interface WeeklyValidationFailure {
  problem_id: string;
  item_id?: string | null;
  mes_code?: string | null;
  reason: string;
  inventory_delta?: number;
  activity_delta?: number;
  operation_ids?: string[];
  log_ids?: string[];
}

export interface WeeklyReportValidation {
  status: "legacy" | "verified" | "failed";
  message: string;
  failures: WeeklyValidationFailure[];
}
