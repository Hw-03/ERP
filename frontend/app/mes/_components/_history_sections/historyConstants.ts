/**
 * historyConstants.ts — history 공통 상수·타입.
 * Phase F1-2: historyShared.ts 에서 추출.
 */
import type { TransactionLog } from "@/lib/api";
import type { LogGroup } from "./historyTableHelpers";

// ──────────────────────────────────────────────────────────────────
// 우측 상세 패널 선택 모델 (history-batch-detail-2026-05-15)
// ──────────────────────────────────────────────────────────────────
export type HistorySelection =
  | { kind: "submission"; group: Extract<LogGroup, { type: "submission" }> }
  | { kind: "log"; log: TransactionLog; allowCancellation?: boolean }
  | { kind: "batch"; batchId: string; logs: TransactionLog[]; groupType?: "operation" | "op_batch" | "batch" | "defect_lifecycle" };

export const HISTORY_PAGE_SIZE = 100;
