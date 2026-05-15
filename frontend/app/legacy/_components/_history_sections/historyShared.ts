import type { Department, TransactionType } from "@/lib/api/types/shared";
import type { IoBatch } from "@/lib/api/types/io";
import { LEGACY_COLORS } from "@/lib/mes/color";

export const HISTORY_PAGE_SIZE = 100;

// ──────────────────────────────────────────────────────────────────
// history-overhaul-2026-05-15: 업무 기준 분류 (Scope)
// 기존 HistoryTab/TAB_TYPE_MAP/EXCEPTION_TYPES 는 점진 폐기 — alias 유지.
// ──────────────────────────────────────────────────────────────────

export type HistoryScope = "ALL" | "WAREHOUSE_INVOLVED" | "DEPT_INTERNAL";

export const SCOPE_LABELS: Record<HistoryScope, string> = {
  ALL: "전체",
  WAREHOUSE_INVOLVED: "창고 포함",
  DEPT_INTERNAL: "부서 내부",
};

// 거래 타입만으로 확정 가능한 분류 (좁게 정의)
export const WAREHOUSE_INVOLVED_TYPES: readonly TransactionType[] = [
  "RECEIVE", "SHIP", "TRANSFER_TO_PROD", "TRANSFER_TO_WH",
  "RESERVE", "RESERVE_RELEASE", "RETURN",
] as const;

export const DEPT_INTERNAL_TYPES: readonly TransactionType[] = [
  "TRANSFER_DEPT", "BACKFLUSH", "PRODUCE", "DISASSEMBLE",
] as const;

// 타입만으로 scope 확정 불가 — IoBatch.lines.from_bucket/to_bucket 참고 필요.
// 정확한 scope 분류는 후속 작업의 백엔드 join 필요.
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

export function isWarehouseInvolvedType(t: string): boolean { return _wh.has(t); }
export function isDepartmentInternalType(t: string): boolean { return _dept.has(t); }
export function isAmbiguousType(t: string): boolean { return _amb.has(t); }
export function isExceptionLike(log: { transaction_type: string; edit_count?: number | null }): boolean {
  if (_exc.has(log.transaction_type)) return true;
  if ((log.edit_count ?? 0) > 0) return true;
  return false;
}

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

/** 표시자: requester_name 우선, 없으면 produced_by 의 괄호 부분 제거. */
export function getHistoryActor(log: { requester_name?: string | null; produced_by?: string | null }): string {
  if (log.requester_name) return log.requester_name;
  if (log.produced_by) {
    const stripped = log.produced_by.split("(")[0]?.trim();
    return stripped && stripped.length > 0 ? stripped : log.produced_by;
  }
  return "-";
}

function _deptName(dept: Department | string | null | undefined): string | null {
  if (!dept) return null;
  return typeof dept === "string" ? dept : null;
}

/** 작업 흐름 라벨. batch 가 있으면 정확한 부서명, 없으면 거래 타입 추론. */
export function getHistoryFlowLabel(
  log: { transaction_type: string },
  batch?: IoBatch | null,
): string {
  if (batch) {
    const fromDept = _deptName(batch.from_department);
    const toDept = _deptName(batch.to_department);
    if (fromDept && toDept) return `${fromDept} → ${toDept}`;
    if (fromDept) return `${fromDept} → ?`;
    if (toDept) return `? → ${toDept}`;
  }
  switch (log.transaction_type) {
    case "RECEIVE": return "공급사 → 창고";
    case "SHIP": return "창고 → 외부";
    case "TRANSFER_TO_PROD": return "창고 → 부서";
    case "TRANSFER_TO_WH": return "부서 → 창고";
    case "TRANSFER_DEPT": return "부서 ↔ 부서";
    case "BACKFLUSH": return "자동차감";
    case "PRODUCE": return "생산 입고";
    case "DISASSEMBLE": return "분해";
    case "SCRAP": return "폐기";
    case "LOSS": return "분실";
    case "MARK_DEFECTIVE": return "불량 처리";
    case "ADJUST": return "수량 조정";
    case "SUPPLIER_RETURN": return "공급사 반품";
    case "RETURN": return "반품";
    case "RESERVE": return "예약";
    case "RESERVE_RELEASE": return "예약 해제";
    default: return log.transaction_type;
  }
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
  { label: "창고 반출", value: "TRANSFER_TO_PROD", transactionTypes: ["TRANSFER_TO_PROD"] },
  { label: "창고 회수", value: "TRANSFER_TO_WH", transactionTypes: ["TRANSFER_TO_WH"] },
  { label: "외부 출고", value: "SHIP", transactionTypes: ["SHIP"] },
  { label: "부서 이동", value: "TRANSFER_DEPT", transactionTypes: ["TRANSFER_DEPT"] },
  { label: "생산", value: "PRODUCE", transactionTypes: ["PRODUCE"] },
  { label: "자동차감", value: "BACKFLUSH", transactionTypes: ["BACKFLUSH"] },
  { label: "예외/정정", value: "EXCEPTION", transactionTypes: [...EXCEPTION_LIKE_TYPES] },
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

export const PROCESS_TYPE_META: Record<string, { label: string; color: string; bg: string }> = {
  TR: { label: "튜브 원자재", color: LEGACY_COLORS.cyan, bg: `color-mix(in srgb, ${LEGACY_COLORS.cyan} 16%, transparent)` },
  TA: { label: "튜브 중간공정", color: LEGACY_COLORS.cyan, bg: `color-mix(in srgb, ${LEGACY_COLORS.cyan} 16%, transparent)` },
  TF: { label: "튜브 공정완료", color: LEGACY_COLORS.cyan, bg: `color-mix(in srgb, ${LEGACY_COLORS.cyan} 16%, transparent)` },
  HR: { label: "고압 원자재", color: LEGACY_COLORS.yellow, bg: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 16%, transparent)` },
  HA: { label: "고압 중간공정", color: LEGACY_COLORS.yellow, bg: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 16%, transparent)` },
  HF: { label: "고압 공정완료", color: LEGACY_COLORS.yellow, bg: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 16%, transparent)` },
  VR: { label: "진공 원자재", color: LEGACY_COLORS.purple, bg: `color-mix(in srgb, ${LEGACY_COLORS.purple} 16%, transparent)` },
  VA: { label: "진공 중간공정", color: LEGACY_COLORS.purple, bg: `color-mix(in srgb, ${LEGACY_COLORS.purple} 16%, transparent)` },
  VF: { label: "진공 공정완료", color: LEGACY_COLORS.purple, bg: `color-mix(in srgb, ${LEGACY_COLORS.purple} 16%, transparent)` },
  NR: { label: "튜닝 원자재", color: "#f97316", bg: "color-mix(in srgb, #f97316 16%, transparent)" },
  NA: { label: "튜닝 중간공정", color: "#f97316", bg: "color-mix(in srgb, #f97316 16%, transparent)" },
  NF: { label: "튜닝 공정완료", color: "#f97316", bg: "color-mix(in srgb, #f97316 16%, transparent)" },
  AR: { label: "조립 원자재", color: "#818cf8", bg: "color-mix(in srgb, #818cf8 16%, transparent)" },
  AA: { label: "조립 중간공정", color: "#818cf8", bg: "color-mix(in srgb, #818cf8 16%, transparent)" },
  AF: { label: "조립 공정완료", color: "#818cf8", bg: "color-mix(in srgb, #818cf8 16%, transparent)" },
  PR: { label: "출하 원자재", color: LEGACY_COLORS.green, bg: `color-mix(in srgb, ${LEGACY_COLORS.green} 16%, transparent)` },
  PA: { label: "출하 중간공정", color: LEGACY_COLORS.green, bg: `color-mix(in srgb, ${LEGACY_COLORS.green} 16%, transparent)` },
  PF: { label: "출하 공정완료", color: LEGACY_COLORS.green, bg: `color-mix(in srgb, ${LEGACY_COLORS.green} 16%, transparent)` },
};

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

export function rowTint(type: string) {
  switch (type) {
    case "RECEIVE":
    case "PRODUCE":
    case "RETURN":
      return "rgba(67,211,157,.05)";
    case "SHIP":
    case "BACKFLUSH":
    case "SCRAP":
    case "LOSS":
      return "rgba(255,123,123,.05)";
    case "ADJUST":
      return "rgba(101,169,255,.05)";
    default:
      return "transparent";
  }
}

export function parseUtc(iso: string) {
  return new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z");
}

export function formatHistoryDate(iso: string) {
  const d = parseUtc(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${min}`;
}

export function toDateKey(iso: string): string {
  const d = parseUtc(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
