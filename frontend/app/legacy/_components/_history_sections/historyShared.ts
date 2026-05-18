import type { TransactionLog } from "@/lib/api";

export { parseUtc, formatHistoryDate, formatHistoryDateTimeLong, toDateKey } from "./historyFormat";
export { rowTint, PROCESS_TYPE_META } from "./historyTheme";
export {
  type HistoryScope,
  SCOPE_LABELS,
  getDefaultHistoryScopeForOperator,
  WAREHOUSE_INVOLVED_TYPES,
  DEPT_INTERNAL_TYPES,
  AMBIGUOUS_TYPES,
  EXCEPTION_LIKE_TYPES,
  isWarehouseInvolvedType,
  isDepartmentInternalType,
  isAmbiguousType,
  isExceptionLike,
  isAdjustmentLike,
  isHiddenHistoryType,
  isReworkOperation,
  classifyHistoryScope,
} from "./transactionTaxonomy";
export {
  type BatchFlowEndpoints,
  getBatchFlowEndpoints,
  getHistoryFlowLabel,
  getHistoryOperationLabel,
  getHistoryDisplayLabel,
  getHistoryDisplaySubLabel,
  getHistoryActor,
  type FlowDescriptor,
  describeBatchFlow,
  getHistoryBomParentLine,
  getHistoryLineStatusLabel,
  type LineSignTone,
  type LineSignedQty,
  getHistoryLineSignedQuantity,
  type MovementTone,
  type MovementSummaryPart,
  type MovementSummary,
  getHistoryMovementSummary,
} from "./historyBatchInterpreter";
export {
  type TypeOption,
  TYPE_OPTIONS,
  DATE_OPTIONS,
  TRANSACTION_TYPES_NONE,
  intersectTransactionTypes,
  getPeriodStart,
  dateFilterToFrom,
} from "./historyQuery";

// ──────────────────────────────────────────────────────────────────
// 우측 상세 패널 선택 모델 (history-batch-detail-2026-05-15)
// ──────────────────────────────────────────────────────────────────
export type HistorySelection =
  | { kind: "log"; log: TransactionLog }
  | { kind: "batch"; batchId: string; logs: TransactionLog[] };

export const HISTORY_PAGE_SIZE = 100;

