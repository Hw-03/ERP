/**
 * Admin / Settings 도메인 API — `@/lib/api/admin`.
 *
 * Round-6 (R6-D3) 분리. 3 메소드:
 *   - verifyAdminPin / updateAdminPin
 */

import { fetchBlob, fetcher, postJson, putJson, toApiUrl } from "../api-core";

export interface AuditCsvFile {
  month: string;
  file_name: string;
  size_bytes: number;
  row_count: number;
}

export interface AuditCsvBackfillResult {
  total_rows: number;
  months: string[];
}

export interface AuditTerminal {
  terminal_id: string;
  name: string;
}

export type ActivityAuditFile = AuditCsvFile;

export type InventoryIntegrityCategory =
  | "DEFECT_STOCK_MISMATCH"
  | "PARTIAL_CANCELLATION"
  | "WORKFLOW_STATE_RESIDUE"
  | "SHIPPING_ALLOCATION_MISMATCH"
  | "DUPLICATE_REVERSAL"
  | "WEEKLY_UNCLASSIFIED_EFFECT";

export interface InventoryIntegrityIssue {
  problem_id: string;
  category: InventoryIntegrityCategory;
  title: string;
  description: string;
  cause_ids: string[];
  current_value: string;
  expected_value: string;
  repairable: boolean;
}

export interface InventoryIntegrityResult {
  generated_at: string;
  is_consistent: boolean;
  issue_count: number;
  category_counts: Record<InventoryIntegrityCategory, number>;
  issues: InventoryIntegrityIssue[];
}

export const adminApi = {
  verifyAdminPin: (pin: string) =>
    postJson<{ message: string }>(toApiUrl("/api/settings/verify-pin"), { pin }),

  updateAdminPin: (payload: { current_pin: string; new_pin: string }) =>
    putJson<{ message: string }>(toApiUrl("/api/settings/admin-pin"), payload),

  listAuditCsvFiles: () =>
    fetcher<AuditCsvFile[]>(toApiUrl("/api/admin/audit-csv/files")),

  downloadAuditFile: (month: string, format: "csv" | "xlsx"): Promise<Blob> =>
    fetchBlob(toApiUrl(`/api/admin/audit-csv/${month}.${format}`)),

  updateCurrentAuditTerminal: (payload: AuditTerminal) =>
    putJson<AuditTerminal>(toApiUrl("/api/admin/activity-audit/terminals/current"), payload),

  listActivityAuditFiles: () =>
    fetcher<ActivityAuditFile[]>(toApiUrl("/api/admin/activity-audit/files")),

  downloadActivityAuditFile: (month: string, format: "csv" | "xlsx"): Promise<Blob> =>
    fetchBlob(toApiUrl(`/api/admin/activity-audit/${month}.${format}`)),

  downloadF704Ledger: (year: number): Promise<Blob> =>
    fetchBlob(toApiUrl(`/api/admin/audit-ledger/f704-02.xlsx?year=${year}`)),

  downloadF705ProductionLog: (year: number): Promise<Blob> =>
    fetchBlob(toApiUrl(`/api/admin/production-log/f705-02.xlsx?year=${year}`)),

  triggerAuditCsvBackfill: () =>
    postJson<AuditCsvBackfillResult>(toApiUrl("/api/admin/audit-csv/backfill")),

  getInventoryIntegrity: () =>
    fetcher<InventoryIntegrityResult>(toApiUrl("/api/admin/inventory-integrity")),
};
