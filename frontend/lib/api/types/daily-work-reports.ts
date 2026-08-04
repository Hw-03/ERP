import type { TransactionDisplayGroup } from "../production";

export interface DailyWorkReport {
  report_id: string;
  work_date: string;
  employee_id: string;
  employee_name: string;
  department: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface DailyWorkActivitySummary {
  operation_key: string;
  operation_label: string;
  work_count: number;
  quantity_by_unit: Record<string, number>;
}

export interface DailyWorkActivity {
  work_date: string;
  employee_id: string;
  summary: DailyWorkActivitySummary[];
  cancelled_count: number;
  details: TransactionDisplayGroup[];
}

export interface SaveDailyWorkReportPayload {
  actorEmployeeId: string;
  content: string;
}
