/**
 * historyQuery.ts — query/필터/기간 조립 심볼.
 * 3차: scope·타입칩 bucket 로직 폐기(KPI 표시전용·필터 패널 단일화).
 * 거래 종류는 OPERATION_OPTIONS 다중. 서버 operation_keys 필터는
 * 백엔드가 shipping_phase / sub_type 우선 "화면 구분" 기준으로 해석한다.
 */

// ──────────────────────────────────────────────────────────────────
// 거래 종류 옵션 — 목록 작업 배지와 같은 현장 언어를 사용한다.
// 값 = 서버 operation_keys 코드. 기존 transaction_type 코드는 API 호환용으로만 유지.
// ──────────────────────────────────────────────────────────────────
export type HistoryOperationKey =
  | "receive"
  | "produce"
  | "disassemble"
  | "item_conversion"
  | "shipping_prepare"
  | "shipping"
  | "outbound"
  | "warehouse_to_dept"
  | "dept_to_warehouse"
  | "dept_transfer"
  | "adjust"
  | "defect"
  | "supplier_return";

export type OperationOption = { value: HistoryOperationKey; label: string };

export const OPERATION_OPTIONS: OperationOption[] = [
  { value: "receive", label: "원자재 입고" },
  { value: "produce", label: "생산" },
  { value: "disassemble", label: "분해" },
  { value: "item_conversion", label: "품목 전환" },
  { value: "shipping_prepare", label: "출하 준비" },
  { value: "shipping", label: "출하" },
  { value: "outbound", label: "출고" },
  { value: "warehouse_to_dept", label: "창고 → 부서" },
  { value: "dept_to_warehouse", label: "부서 → 창고" },
  { value: "dept_transfer", label: "부서 → 부서" },
  { value: "adjust", label: "수량 조정" },
  { value: "defect", label: "불량 처리" },
  { value: "supplier_return", label: "원자재 반품" },
];

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
