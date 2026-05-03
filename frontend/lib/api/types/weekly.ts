export interface WeeklyItemReport {
  item_id: string;
  erp_code: string | null;
  item_name: string;
  prev_qty: number;
  in_qty: number;
  out_qty: number;
  current_qty: number;
  delta: number;
}

export interface WeeklyGroupReport {
  process_code: string;
  dept_name: string;
  label: string;
  item_count: number;
  prev_qty: number;
  in_qty: number;
  out_qty: number;
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
  total_in_qty: number;
  total_out_qty: number;
  groups_increasing: number;
  groups_decreasing: number;
  groups_unchanged: number;
}

export interface WeeklyReportResponse {
  week_start: string;
  week_end: string;
  groups: WeeklyGroupReport[];
  summary: WeeklyReportSummary;
  warnings: WeeklyWarning[];
}
