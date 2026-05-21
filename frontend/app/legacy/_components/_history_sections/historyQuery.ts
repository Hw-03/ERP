/**
 * historyQuery.ts — query/필터/기간 조립 심볼.
 * 3차: scope·타입칩 bucket 로직 폐기(KPI 표시전용·필터 패널 단일화).
 * 거래 종류는 OPERATION_OPTIONS(전 11종) 다중. 서버 transaction_types 필터는
 * 백엔드 _operation_filter 가 sub_type 우선 "화면 구분" 기준으로 해석한다.
 */
import type { TransactionType } from "@/lib/api/types/shared";

// ──────────────────────────────────────────────────────────────────
// 거래 종류 옵션 — 전 11종 고정, 다중 선택.
// 값 = transaction_type 코드. 라벨 = historyBatchInterpreter.ts 의 _TX_OPERATION 과 동일.
// 프런트는 코드만 전송하고, batch.sub_type 우선 매핑은 백엔드가 담당(목록 구분명과 필터 일치).
// ──────────────────────────────────────────────────────────────────
export type OperationOption = { value: TransactionType; label: string };

export const OPERATION_OPTIONS: OperationOption[] = [
  { value: "RECEIVE", label: "원자재 입고" },
  { value: "PRODUCE", label: "생산 등록" },
  { value: "SHIP", label: "출고" },
  { value: "BACKFLUSH", label: "자동 차감" },
  { value: "TRANSFER_TO_PROD", label: "창고 반출" },
  { value: "TRANSFER_TO_WH", label: "창고 반입" },
  { value: "TRANSFER_DEPT", label: "부서 이동" },
  { value: "DISASSEMBLE", label: "재작업" },
  { value: "ADJUST", label: "수량 조정" },
  { value: "MARK_DEFECTIVE", label: "불량 처리" },
  { value: "SUPPLIER_RETURN", label: "공급사 반품" },
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
