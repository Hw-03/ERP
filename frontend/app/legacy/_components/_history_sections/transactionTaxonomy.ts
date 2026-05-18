/**
 * transactionTaxonomy.ts — 거래 타입 분류 상수·술어·scope 모델.
 * C3: historyShared.ts 에서 추출. 소비자는 historyShared 재export 또는 직접 import.
 */
import type { TransactionType } from "@/lib/api/types/shared";
import type { IoBatch } from "@/lib/api/types/io";

// ──────────────────────────────────────────────────────────────────
// Scope 모델
// ──────────────────────────────────────────────────────────────────

export type HistoryScope = "ALL" | "WAREHOUSE_INVOLVED" | "DEPT_INTERNAL";

export const SCOPE_LABELS: Record<HistoryScope, string> = {
  ALL: "전체",
  WAREHOUSE_INVOLVED: "창고",
  DEPT_INTERNAL: "부서",
};

/**
 * 사용자별 입출고 내역 기본 scope.
 * warehouse_role 이 "primary" 또는 "deputy" 이면 창고 담당 → WAREHOUSE_INVOLVED.
 * 그 외(none 포함) → DEPT_INTERNAL.
 */
export function getDefaultHistoryScopeForOperator(
  operator: { warehouse_role?: string | null } | null,
): HistoryScope {
  const role = operator?.warehouse_role?.toLowerCase();
  if (role === "primary" || role === "deputy") return "WAREHOUSE_INVOLVED";
  return "DEPT_INTERNAL";
}

// ──────────────────────────────────────────────────────────────────
// 거래 타입 분류 상수
// ──────────────────────────────────────────────────────────────────

export const WAREHOUSE_INVOLVED_TYPES: readonly TransactionType[] = [
  "RECEIVE", "SHIP", "TRANSFER_TO_PROD", "TRANSFER_TO_WH",
  "RESERVE", "RESERVE_RELEASE", "RETURN",
] as const;

export const DEPT_INTERNAL_TYPES: readonly TransactionType[] = [
  "TRANSFER_DEPT", "BACKFLUSH", "PRODUCE", "DISASSEMBLE",
] as const;

// 타입만으로 scope 확정 불가 — IoBatch.lines.from_bucket/to_bucket 참고 필요.
export const AMBIGUOUS_TYPES: readonly TransactionType[] = [
  "ADJUST", "MARK_DEFECTIVE", "SUPPLIER_RETURN", "SCRAP", "LOSS",
] as const;

// "예외/정정" 칩/카드 기준 (UX). KPI 카운트에는 edit_count>0 도 포함됨.
export const EXCEPTION_LIKE_TYPES: readonly TransactionType[] = [
  "ADJUST", "MARK_DEFECTIVE", "SUPPLIER_RETURN", "SCRAP", "LOSS",
] as const;

const _wh = new Set<string>(WAREHOUSE_INVOLVED_TYPES);
const _dept = new Set<string>(DEPT_INTERNAL_TYPES);
const _amb = new Set<string>(AMBIGUOUS_TYPES);
const _exc = new Set<string>(EXCEPTION_LIKE_TYPES);

const _HIDDEN_TYPES = new Set<string>([
  "SCRAP", "LOSS", "DISASSEMBLE", "RETURN", "RESERVE", "RESERVE_RELEASE", "TRANSFER_DEPT",
]);

// ──────────────────────────────────────────────────────────────────
// 술어
// ──────────────────────────────────────────────────────────────────

export function isWarehouseInvolvedType(t: string): boolean { return _wh.has(t); }
export function isDepartmentInternalType(t: string): boolean { return _dept.has(t); }
export function isAmbiguousType(t: string): boolean { return _amb.has(t); }

export function isExceptionLike(log: { transaction_type: string; edit_count?: number | null }): boolean {
  if (_exc.has(log.transaction_type)) return true;
  if ((log.edit_count ?? 0) > 0) return true;
  return false;
}

/**
 * 화면 표시용 "수량 조정" 카운트 — ADJUST 거래만.
 */
export function isAdjustmentLike(log: { transaction_type: string }): boolean {
  return log.transaction_type === "ADJUST";
}

/** 주요 칩에서 숨길 타입 여부. */
export function isHiddenHistoryType(type: string): boolean {
  return _HIDDEN_TYPES.has(type);
}

/** 재작업 (DISASSEMBLE/disassemble) 여부 — 라벨/색 빨강 처리 분기용. */
export function isReworkOperation(
  log: { transaction_type: string },
  batch?: { sub_type?: string | null } | null,
): boolean {
  if (batch?.sub_type === "disassemble") return true;
  return log.transaction_type === "DISASSEMBLE";
}

// ──────────────────────────────────────────────────────────────────
// Scope 분류
// ──────────────────────────────────────────────────────────────────

/**
 * IoBatch 보강 분류. batch.lines 의 bucket 으로 정확히 판단.
 * batch 가 없으면 거래 타입 기반 (ambiguous 는 그대로).
 */
export function classifyHistoryScope(
  log: { transaction_type: string },
  batch?: IoBatch | null,
): "warehouse_involved" | "department_internal" | "ambiguous" {
  if (batch) {
    let touchesWarehouse = false;
    let onlyProduction = true;
    for (const bundle of batch.bundles) {
      for (const line of bundle.lines) {
        if (line.from_bucket === "warehouse" || line.to_bucket === "warehouse") touchesWarehouse = true;
        if (line.from_bucket !== "production" || line.to_bucket !== "production") onlyProduction = false;
      }
    }
    if (touchesWarehouse) return "warehouse_involved";
    if (onlyProduction) return "department_internal";
    return "ambiguous";
  }
  if (isWarehouseInvolvedType(log.transaction_type)) return "warehouse_involved";
  if (isDepartmentInternalType(log.transaction_type)) return "department_internal";
  return "ambiguous";
}
