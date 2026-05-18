import type { TransactionLog } from "@/lib/api";
import type { TransactionType } from "@/lib/api/types/shared";
import {
  type HistoryScope,
  WAREHOUSE_INVOLVED_TYPES,
  DEPT_INTERNAL_TYPES,
} from "./transactionTaxonomy";

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

// ──────────────────────────────────────────────────────────────────
// 우측 상세 패널 선택 모델 (history-batch-detail-2026-05-15)
// ──────────────────────────────────────────────────────────────────
export type HistorySelection =
  | { kind: "log"; log: TransactionLog }
  | { kind: "batch"; batchId: string; logs: TransactionLog[] };

export const HISTORY_PAGE_SIZE = 100;

/** scope+typeFilter 교집합을 서버 transaction_types(쉼표) 문자열로. 빈 교집합은 "__NONE__". */
export const TRANSACTION_TYPES_NONE = "__NONE__";

export function intersectTransactionTypes(
  scope: HistoryScope,
  typeFilter: string,
): string | undefined {
  const scopeTypes: Set<string> | null = scope === "ALL"
    ? null
    : new Set<string>(scope === "WAREHOUSE_INVOLVED" ? WAREHOUSE_INVOLVED_TYPES : DEPT_INTERNAL_TYPES);

  let chipTypes: Set<string> | null = null;
  const chip = TYPE_OPTIONS.find((o) => o.value === typeFilter);
  if (chip && chip.transactionTypes.length > 0) {
    chipTypes = new Set<string>(chip.transactionTypes);
  }

  if (!scopeTypes && !chipTypes) return undefined;
  if (!scopeTypes) return Array.from(chipTypes!).join(",");
  if (!chipTypes) return Array.from(scopeTypes).join(",");
  const inter: string[] = [];
  chipTypes.forEach((t) => {
    if (scopeTypes!.has(t)) inter.push(t);
  });
  return inter.length > 0 ? inter.join(",") : TRANSACTION_TYPES_NONE;
}

// ──────────────────────────────────────────────────────────────────
// 거래 유형 칩 옵션 (객체 모델)
// label/value 외에 transactionTypes 를 명시 — 그룹 옵션(SHIP/TRANSFER_*) 도 지원.
// ──────────────────────────────────────────────────────────────────

export type TypeOption = {
  label: string;
  value: string;
  /** 빈 배열 = "전체" (필터 없음). */
  transactionTypes: TransactionType[];
};

export const TYPE_OPTIONS: TypeOption[] = [
  { label: "전체", value: "ALL", transactionTypes: [] },
  { label: "원자재 입고", value: "RECEIVE", transactionTypes: ["RECEIVE"] },
  { label: "생산 등록", value: "PRODUCE", transactionTypes: ["PRODUCE"] },
  { label: "출고", value: "SHIP", transactionTypes: ["SHIP"] },
  { label: "수량 조정", value: "ADJUST", transactionTypes: ["ADJUST"] },
  { label: "자동 차감", value: "BACKFLUSH", transactionTypes: ["BACKFLUSH"] },
  { label: "창고 반출", value: "TRANSFER_TO_PROD", transactionTypes: ["TRANSFER_TO_PROD"] },
  { label: "창고 반입", value: "TRANSFER_TO_WH", transactionTypes: ["TRANSFER_TO_WH"] },
  { label: "불량 처리", value: "MARK_DEFECTIVE", transactionTypes: ["MARK_DEFECTIVE"] },
  { label: "공급사 반품", value: "SUPPLIER_RETURN", transactionTypes: ["SUPPLIER_RETURN"] },
];

// ──────────────────────────────────────────────────────────────────
// 점진 폐기 alias (다른 archive/모바일 파일 호환). 후속에서 제거.
// ──────────────────────────────────────────────────────────────────

/** @deprecated history-overhaul-2026-05: HistoryScope 사용. */
export type HistoryTab = "ALL" | "WAREHOUSE" | "DEPT";
/** @deprecated */
export const TAB_LABELS: Record<HistoryTab, string> = {
  ALL: "전체", WAREHOUSE: "창고", DEPT: "부서",
};
/** @deprecated */
export const TAB_TYPE_MAP: Record<HistoryTab, string | undefined> = {
  ALL: undefined,
  WAREHOUSE: "RECEIVE,SHIP,ADJUST,SUPPLIER_RETURN,RETURN,RESERVE,RESERVE_RELEASE",
  DEPT: "TRANSFER_TO_PROD,TRANSFER_TO_WH,TRANSFER_DEPT,MARK_DEFECTIVE,BACKFLUSH,PRODUCE,SCRAP,LOSS,DISASSEMBLE",
};
/** @deprecated isExceptionLike 사용. */
export const EXCEPTION_TYPES = new Set(["ADJUST", "SCRAP", "LOSS", "DISASSEMBLE", "MARK_DEFECTIVE"]);

export const DATE_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "오늘", value: "TODAY" },
  { label: "이번주", value: "WEEK" },
  { label: "이번달", value: "MONTH" },
];

export function getPeriodStart(value: string): Date | null {
  const now = new Date();
  if (value === "TODAY") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (value === "WEEK") {
    const copy = new Date(now);
    copy.setDate(copy.getDate() - copy.getDay());
    copy.setHours(0, 0, 0, 0);
    return copy;
  }
  if (value === "MONTH") return new Date(now.getFullYear(), now.getMonth(), 1);
  return null;
}

/** dateFilter 값(`TODAY`/`WEEK`/`MONTH`/`ALL`) → date_from 쿼리 파라미터(YYYY-MM-DD). */
export function dateFilterToFrom(dateFilter: string): string | undefined {
  const d = getPeriodStart(dateFilter);
  if (!d) return undefined;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

