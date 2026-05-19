/**
 * historyQuery.ts — query/필터/기간 조립 심볼.
 * Phase F1-1: historyShared.ts 에서 추출.
 */
import type { TransactionType } from "@/lib/api/types/shared";
import {
  type HistoryScope,
  WAREHOUSE_INVOLVED_TYPES,
  DEPT_INTERNAL_TYPES,
} from "./transactionTaxonomy";

export { type HistoryScope };

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
  // "수량 조정"(ADJUST) 칩 제거 — 상단 KPI '수량조정' 박스로만 (#5).
  { label: "자동 차감", value: "BACKFLUSH", transactionTypes: ["BACKFLUSH"] },
  { label: "창고 반출", value: "TRANSFER_TO_PROD", transactionTypes: ["TRANSFER_TO_PROD"] },
  { label: "창고 반입", value: "TRANSFER_TO_WH", transactionTypes: ["TRANSFER_TO_WH"] },
  { label: "불량 처리", value: "MARK_DEFECTIVE", transactionTypes: ["MARK_DEFECTIVE"] },
  { label: "공급사 반품", value: "SUPPLIER_RETURN", transactionTypes: ["SUPPLIER_RETURN"] },
];

export const DATE_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "오늘", value: "TODAY" },
  { label: "이번주", value: "WEEK" },
  { label: "이번달", value: "MONTH" },
];

/**
 * 상단 KPI 박스(activeBucket)별로 노출할 거래유형 칩 (#6/#8).
 * - 미선택("all")·수량조정: 칩 줄 자체 숨김(빈 배열).
 * - 출고/불량 처리는 창고·부서 양쪽.
 */
const BUCKET_TYPE_CHIP_VALUES: Record<string, string[]> = {
  all: [],
  adjust: [],
  warehouse: ["RECEIVE", "SHIP", "TRANSFER_TO_PROD", "TRANSFER_TO_WH", "SUPPLIER_RETURN", "MARK_DEFECTIVE"],
  dept: ["PRODUCE", "BACKFLUSH", "SHIP", "MARK_DEFECTIVE"],
};

/** activeBucket 에 맞는 칩 목록("전체" 리셋 칩 선두 포함). 빈 = 칩 줄 숨김. */
export function typeChipsForBucket(bucket: string): TypeOption[] {
  const vals = BUCKET_TYPE_CHIP_VALUES[bucket] ?? [];
  if (vals.length === 0) return [];
  const all = TYPE_OPTIONS.find((o) => o.value === "ALL");
  const picked = TYPE_OPTIONS.filter((o) => vals.includes(o.value));
  return all ? [all, ...picked] : picked;
}

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
