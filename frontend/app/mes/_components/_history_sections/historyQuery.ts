/**
 * historyQuery.ts — query/필터/기간 조립 심볼.
 * 3차: scope·타입칩 bucket 로직 폐기(KPI 표시전용·필터 패널 단일화).
 * 작업 종류는 OPERATION_OPTIONS 다중. 서버 operation_keys 필터는
 * 백엔드가 shipping_phase / sub_type 우선 "화면 구분" 기준으로 해석한다.
 */

// ──────────────────────────────────────────────────────────────────
// 거래 종류 옵션 — 목록 작업 배지와 같은 현장 언어를 사용한다.
// 값 = 서버 operation_keys 코드. 기존 transaction_type 코드는 API 호환용으로만 유지.
// ──────────────────────────────────────────────────────────────────
export type HistoryOperationKey =
  | "warehouse"
  | "process"
  | "defect"
  | "item_conversion"
  | "shipping";

export type OperationOption = { value: HistoryOperationKey; label: string };

export const OPERATION_OPTIONS: OperationOption[] = [
  { value: "warehouse", label: "창고 입출고" },
  { value: "process", label: "부서 입출고" },
  { value: "defect", label: "불량" },
  { value: "item_conversion", label: "품목 전환" },
  { value: "shipping", label: "출하" },
];

export const DATE_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "오늘", value: "TODAY" },
  { label: "이번주", value: "WEEK" },
  { label: "이번달", value: "MONTH" },
];

/** 달력과 같은 0-based month를 쓰는 선택 월. */
export type SelectedHistoryMonth = {
  year: number;
  month: number;
};

export type HistoryDateRange = {
  dateFrom?: string;
  dateTo?: string;
  periodLabel: string;
};

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function formatHistoryMonthLabel(selectedMonth: SelectedHistoryMonth): string {
  return `${selectedMonth.year}년 ${selectedMonth.month + 1}월`;
}

/**
 * 입출고 목록·요약이 공유하는 날짜 범위. 서버 date_to는 업무 날짜 기준으로 포함된다.
 * 하루 > 달력 월 > 상단 기간 버튼 순서로 한 가지 조건만 적용한다.
 */
export function resolveHistoryDateRange(
  dateFilter: string,
  selectedDay: string | null,
  selectedMonth: SelectedHistoryMonth | null,
): HistoryDateRange {
  if (selectedDay) return { dateFrom: selectedDay, dateTo: selectedDay, periodLabel: selectedDay };
  if (selectedMonth) {
    const lastDay = new Date(selectedMonth.year, selectedMonth.month + 1, 0).getDate();
    return {
      dateFrom: toDateKey(selectedMonth.year, selectedMonth.month, 1),
      dateTo: toDateKey(selectedMonth.year, selectedMonth.month, lastDay),
      periodLabel: formatHistoryMonthLabel(selectedMonth),
    };
  }
  return {
    dateFrom: dateFilterToFrom(dateFilter),
    periodLabel: DATE_OPTIONS.find((option) => option.value === dateFilter)?.label ?? "전체",
  };
}

function getKstDateParts(now: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const read = (type: "year" | "month" | "day") => Number(parts.find((part) => part.type === type)?.value);
  return { year: read("year"), month: read("month") - 1, day: read("day") };
}

export function getPeriodStart(value: string, now: Date = new Date()): Date | null {
  const { year, month, day } = getKstDateParts(now);
  if (value === "TODAY") return new Date(year, month, day);
  if (value === "WEEK") {
    const copy = new Date(year, month, day);
    const kstDayOfWeek = new Date(Date.UTC(year, month, day)).getUTCDay();
    copy.setDate(copy.getDate() - kstDayOfWeek);
    return copy;
  }
  if (value === "MONTH") return new Date(year, month, 1);
  return null;
}

/** dateFilter 값(`TODAY`/`WEEK`/`MONTH`/`ALL`) → date_from 쿼리 파라미터(YYYY-MM-DD). */
export function dateFilterToFrom(dateFilter: string, now: Date = new Date()): string | undefined {
  const d = getPeriodStart(dateFilter, now);
  if (!d) return undefined;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
