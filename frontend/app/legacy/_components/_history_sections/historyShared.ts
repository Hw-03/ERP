import type { TransactionLog } from "@/lib/api";
import type { Department, TransactionType } from "@/lib/api/types/shared";
import type { IoBatch } from "@/lib/api/types/io";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";

// ──────────────────────────────────────────────────────────────────
// 우측 상세 패널 선택 모델 (history-batch-detail-2026-05-15)
// 단일 거래 행과 op_batch 묶음 행 둘 다 우측 패널을 열 수 있도록 union.
// batch 객체 자체는 batchCache 에서 조회 — selection 에는 키만.
// ──────────────────────────────────────────────────────────────────
export type HistorySelection =
  | { kind: "log"; log: TransactionLog }
  | { kind: "batch"; batchId: string; logs: TransactionLog[] };

export const HISTORY_PAGE_SIZE = 100;

// ──────────────────────────────────────────────────────────────────
// history-overhaul-2026-05-15: 업무 기준 분류 (Scope)
// 기존 HistoryTab/TAB_TYPE_MAP/EXCEPTION_TYPES 는 점진 폐기 — alias 유지.
// ──────────────────────────────────────────────────────────────────

export type HistoryScope = "ALL" | "WAREHOUSE_INVOLVED" | "DEPT_INTERNAL";

export const SCOPE_LABELS: Record<HistoryScope, string> = {
  ALL: "전체",
  WAREHOUSE_INVOLVED: "창고",
  DEPT_INTERNAL: "부서",
};

/**
 * 사용자별 입출고 내역 기본 scope.
 * 현재는 권동환만 창고 담당 → WAREHOUSE_INVOLVED, 그 외 DEPT_INTERNAL.
 * employee_id 기준 전환 대비 단일 helper 안에 isolate.
 * Operator 타입 import는 의도적으로 안 함 (순환 import 회피).
 */
export function getDefaultHistoryScopeForOperator(
  operator: { name?: string | null } | null,
): HistoryScope {
  if (operator?.name?.trim() === "권동환") return "WAREHOUSE_INVOLVED";
  return "DEPT_INTERNAL";
}

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
 * 화면 표시용 "수량 조정" 카운트 — ADJUST 거래만.
 * label-followup-2026-05-15: KPI/달력 카드 라벨이 "수량 조정"으로 좁혀졌으므로
 * 카운트 기준도 좁혀 사용자 표시 숫자가 의미와 일치.
 */
export function isAdjustmentLike(log: { transaction_type: string }): boolean {
  return log.transaction_type === "ADJUST";
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

// ──────────────────────────────────────────────────────────────────
// Batch flow endpoints — IoLine.from_bucket/to_bucket + batch.sub_type 컨텍스트로
// "창고/부서명/불량/외부/생산/분해/수량 조정" 라벨을 만든다. 명확하지 않으면 null.
// ──────────────────────────────────────────────────────────────────

export interface BatchFlowEndpoints {
  from: string;
  to: string;
  /** 끝점 중 하나 이상이 라인마다 다른 위치를 가질 때. 그 끝점은 "여러 위치"로 표시됨. */
  mixed: boolean;
}

type BucketSlot = { bucket: string; dept: string | null };

function _bucketSlotKey(s: BucketSlot): string {
  return `${s.bucket}|${s.dept ?? ""}`;
}

/** none bucket 라벨 — sub_type 컨텍스트 의존. 매핑 안 되면 null. */
function _labelNoneBucket(subType: string | null | undefined, side: "from" | "to"): string | null {
  switch (subType) {
    case "receive_supplier":
      // 공급사 → 창고 — none 은 from(공급사 측)
      return side === "from" ? "외부" : null;
    case "supplier_return":
      // 창고/부서 → 공급사 — none 은 to(공급사 측)
      return side === "to" ? "외부" : null;
    case "produce":
      // BOM 소비/생산: none → "생산" (방향성)
      return "생산";
    case "disassemble":
      return "재작업";
    case "adjust_in":
    case "adjust_out":
      return "수량 조정";
    default:
      return null;
  }
}

function _labelBucketSlot(slot: BucketSlot, subType: string | null | undefined, side: "from" | "to"): string | null {
  switch (slot.bucket) {
    case "warehouse": return "창고";
    case "production": return slot.dept || "부서";
    case "defective": return slot.dept ? `${slot.dept} 불량` : "불량";
    case "none": return _labelNoneBucket(subType, side);
    default: return null;
  }
}

export function getBatchFlowEndpoints(batch: IoBatch): BatchFlowEndpoints | null {
  const fromSlots = new Map<string, BucketSlot>();
  const toSlots = new Map<string, BucketSlot>();

  for (const bundle of batch.bundles) {
    for (const line of bundle.lines) {
      const fs: BucketSlot = { bucket: line.from_bucket, dept: _deptName(line.from_department) };
      const ts: BucketSlot = { bucket: line.to_bucket, dept: _deptName(line.to_department) };
      fromSlots.set(_bucketSlotKey(fs), fs);
      toSlots.set(_bucketSlotKey(ts), ts);
    }
  }

  // 라인이 0 건이면 batch.from_department/to_department 텍스트 fallback
  if (fromSlots.size === 0 && toSlots.size === 0) {
    const f = _deptName(batch.from_department);
    const t = _deptName(batch.to_department);
    if (f && t) return { from: f, to: t, mixed: false };
    return null;
  }

  const subType = batch.sub_type ?? null;

  let fromLabel: string;
  let mixedFrom = false;
  if (fromSlots.size === 1) {
    const slot = fromSlots.values().next().value as BucketSlot;
    const lbl = _labelBucketSlot(slot, subType, "from");
    if (!lbl) return null;
    fromLabel = lbl;
  } else {
    fromLabel = "여러 위치";
    mixedFrom = true;
  }

  let toLabel: string;
  let mixedTo = false;
  if (toSlots.size === 1) {
    const slot = toSlots.values().next().value as BucketSlot;
    const lbl = _labelBucketSlot(slot, subType, "to");
    if (!lbl) return null;
    toLabel = lbl;
  } else {
    toLabel = "여러 위치";
    mixedTo = true;
  }

  return { from: fromLabel, to: toLabel, mixed: mixedFrom || mixedTo };
}

/** 작업 흐름 라벨. batch 있고 명확하면 부서/창고/불량/생산 등으로, 그 외 거래 타입 추론. */
export function getHistoryFlowLabel(
  log: { transaction_type: string },
  batch?: IoBatch | null,
): string {
  if (batch) {
    const eps = getBatchFlowEndpoints(batch);
    if (eps) return `${eps.from} → ${eps.to}`;
    // helper 가 null 이면 batch 무시, type fallback 으로 떨어짐.
  }
  switch (log.transaction_type) {
    case "RECEIVE": return "공급사 → 창고";
    case "SHIP": return "창고 → 외부";
    case "TRANSFER_TO_PROD": return "창고 → 부서";
    case "TRANSFER_TO_WH": return "부서 → 창고";
    case "TRANSFER_DEPT": return "부서 ↔ 부서";
    case "BACKFLUSH": return "자동차감";
    case "PRODUCE": return "생산 입고";
    case "DISASSEMBLE": return "재작업";
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

// ──────────────────────────────────────────────────────────────────
// 작업 의도 라벨 — 위치 흐름과 분리.
// 사용자가 "무슨 작업을 했나"를 한 단어로 이해할 수 있는 표시.
// batch.sub_type 우선, 없으면 transaction_type 기반.
// ──────────────────────────────────────────────────────────────────

const _SUB_TYPE_OPERATION: Record<string, string> = {
  produce: "생산 등록",
  disassemble: "재작업",
  warehouse_to_dept: "창고 반출",
  dept_to_warehouse: "창고 반입",
  dept_transfer: "부서 이동",
  adjust_in: "수량 조정",
  adjust_out: "수량 조정",
  receive_supplier: "원자재 입고",
  supplier_return: "공급사 반품",
  defect_quarantine: "불량 처리",
};

const _TX_OPERATION: Record<string, string> = {
  RECEIVE: "원자재 입고",
  SHIP: "출고",
  TRANSFER_TO_PROD: "창고 반출",
  TRANSFER_TO_WH: "창고 반입",
  TRANSFER_DEPT: "부서 이동",
  BACKFLUSH: "자동 차감",
  PRODUCE: "생산 등록",
  DISASSEMBLE: "재작업",
  ADJUST: "수량 조정",
  MARK_DEFECTIVE: "불량 처리",
  SUPPLIER_RETURN: "공급사 반품",
  SCRAP: "폐기",
  LOSS: "손실",
  RETURN: "반품",
  RESERVE: "예약",
  RESERVE_RELEASE: "예약 해제",
};

export function getHistoryOperationLabel(
  log: { transaction_type: string },
  batch?: IoBatch | null,
): string {
  if (batch?.sub_type) {
    const fromSub = _SUB_TYPE_OPERATION[batch.sub_type];
    if (fromSub) return fromSub;
  }
  return _TX_OPERATION[log.transaction_type] ?? log.transaction_type;
}

// ──────────────────────────────────────────────────────────────────
// 화면 정본 표시 — 단일 행/묶음 행/우측 패널이 모두 이걸 사용.
// label-calendar-2026-05-15: getTransactionLabel(mes-status) 분기를 이걸로 통일.
// 의도 라벨은 getHistoryOperationLabel 결과를 그대로 노출 (sub_type 우선 + tx fallback).
// 보조문구는 sub_type/tx 별 의미 매핑 우선, 없고 mixed=false 면 "{from} → {to}".
// ──────────────────────────────────────────────────────────────────

const _DISPLAY_SUB_LABEL: Record<string, string> = {
  // sub_type
  produce: "부품 차감 + 완제품 입고",
  receive_supplier: "창고로 들어옴",
  warehouse_to_dept: "창고에서 부서로 이동",
  dept_to_warehouse: "부서에서 창고로 이동",
  defect_quarantine: "정상 재고 → 불량 재고",
  supplier_return: "공급사로 돌려보냄",
  adjust_in: "재고 수량 직접 수정",
  adjust_out: "재고 수량 직접 수정",
  // transaction_type
  RECEIVE: "창고로 들어옴",
  SHIP: "회사 밖으로 나감",
  ADJUST: "재고 수량 직접 수정",
  BACKFLUSH: "BOM 기준 부품 차감",
  PRODUCE: "부품 차감 + 완제품 입고",
  TRANSFER_TO_PROD: "창고에서 부서로 이동",
  TRANSFER_TO_WH: "부서에서 창고로 이동",
  MARK_DEFECTIVE: "정상 재고 → 불량 재고",
  SUPPLIER_RETURN: "공급사로 돌려보냄",
};

/** 화면 정본 메인 라벨. 의도 우선. 모든 row/패널이 같은 정책으로 보이도록. */
export function getHistoryDisplayLabel(
  log: { transaction_type: string },
  batch?: IoBatch | null,
): string {
  return getHistoryOperationLabel(log, batch);
}

/** 화면 정본 보조문구. 의미문구 우선, 없고 단일 명확한 흐름이면 "{from} → {to}". */
export function getHistoryDisplaySubLabel(
  log: { transaction_type: string },
  batch?: IoBatch | null,
): string | undefined {
  if (batch?.sub_type) {
    const fromSub = _DISPLAY_SUB_LABEL[batch.sub_type];
    if (fromSub) return fromSub;
  }
  const fromTx = _DISPLAY_SUB_LABEL[log.transaction_type];
  if (fromTx) return fromTx;
  if (batch) {
    const eps = getBatchFlowEndpoints(batch);
    if (eps && !eps.mixed) return `${eps.from} → ${eps.to}`;
  }
  return undefined;
}

/** BOM/번들 라인 상태 — "포함"/"제외"/"부족 N" 통일. */
export function getHistoryLineStatusLabel(line: {
  included: boolean;
  shortage?: number | null;
}): { label: string; tone: "ok" | "muted" | "danger" } {
  if (!line.included) return { label: "제외", tone: "muted" };
  const shortage = line.shortage ?? 0;
  if (shortage > 0) return { label: `부족 ${shortage}`, tone: "danger" };
  return { label: "포함", tone: "ok" };
}

const _HIDDEN_TYPES = new Set<string>([
  "SCRAP", "LOSS", "DISASSEMBLE", "RETURN", "RESERVE", "RESERVE_RELEASE", "TRANSFER_DEPT",
]);

/** 주요 칩에서 숨길 타입 여부. fallback 표시는 historyDisplay 가 처리. */
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

/**
 * BOM bundle 의 부모 라인(BOM 자기 자신) 반환. 단품 번들/없으면 null.
 * BomBatchDetail 헤더 흡수, BundleBlock 헤더 흡수, getHistoryMovementSummary 합 계산이 같이 사용
 * → 펼친 BOM 라인 표시와 변동요약 합계가 항상 같은 부모 판정으로 일치.
 */
export function getHistoryBomParentLine<L extends { origin: string }>(
  bundle: { source_kind?: string | null; lines: L[] } | null | undefined,
): L | null {
  if (!bundle || bundle.source_kind !== "bom_parent") return null;
  return bundle.lines.find((l) => l.origin === "direct") ?? null;
}

// ──────────────────────────────────────────────────────────────────
// BOM/op_batch 라인 수량 부호+색 — line-sign-2026-05-15
// 백엔드 line.direction 만 보면 재작업(disassemble) BOM 자식이 모두 빨강으로 보임.
// 화면은 batch.sub_type + bundle.source_kind + line.origin 컨텍스트로 결정.
// ──────────────────────────────────────────────────────────────────

export type LineSignTone = "increase" | "decrease" | "move" | "muted";

export interface LineSignedQty {
  /** "+" / "-" / "" (이동/일부 케이스는 부호 없음). */
  sign: "+" | "-" | "";
  /** 완성 라벨. 예: "+11 EA" / "-11 EA" / "이동 11 EA". */
  label: string;
  tone: LineSignTone;
  /** included 라인 여부. false 면 tone="muted" + dim 호출처에서 처리. */
  isApplied: boolean;
}

function _quantityFormat(q: number | string): string {
  return formatQty(typeof q === "number" ? q : Number(q));
}

function _withUnit(qty: string, unit?: string | null): string {
  const u = unit?.trim() ?? "";
  return u ? `${qty} ${u}` : qty;
}

function _signed(sign: "+" | "-", qty: string, unit?: string | null): string {
  return `${sign}${_withUnit(qty, unit)}`;
}

/**
 * BOM/op_batch 라인의 화면 표시 부호 + tone.
 * - bundle.source_kind === "bom_parent" 이고 line.origin === "direct" → 상위(BOM 부모).
 * - 작업 종류(batch.sub_type) 기반 매핑 우선, 없으면 line.direction fallback.
 * - included=false 면 tone="muted" 강제 (sign/label 형식은 그대로).
 */
export function getHistoryLineSignedQuantity(
  line: {
    included: boolean;
    origin: string;
    direction: string;
    quantity: number | string;
    unit?: string | null;
  },
  batch?: { sub_type?: string | null } | null,
  bundle?: { source_kind?: string | null } | null,
): LineSignedQty {
  const qty = _quantityFormat(line.quantity);
  const unit = line.unit ?? null;
  const isBomParent = bundle?.source_kind === "bom_parent" && line.origin === "direct";
  const isBomChild = bundle?.source_kind === "bom_parent" && line.origin !== "direct";
  const sub = batch?.sub_type;

  let sign: "+" | "-" | "" = "+";
  let label = "";
  let tone: LineSignTone = "increase";

  const setIncrease = () => { sign = "+"; tone = "increase"; label = _signed("+", qty, unit); };
  const setDecrease = () => { sign = "-"; tone = "decrease"; label = _signed("-", qty, unit); };
  const setMove = () => { sign = ""; tone = "move"; label = `이동 ${_withUnit(qty, unit)}`; };

  // 1) sub_type 우선 분기.
  let matched = true;
  switch (sub) {
    case "produce":
      if (isBomParent) setIncrease();
      else if (isBomChild) setDecrease();
      else matched = false;  // 단품/일반 — fallback
      break;
    case "disassemble":
      if (isBomParent) setDecrease();
      else if (isBomChild) setIncrease();
      else matched = false;
      break;
    case "warehouse_to_dept": setDecrease(); break;
    case "dept_to_warehouse": setIncrease(); break;
    case "receive_supplier": setIncrease(); break;
    case "supplier_return":
    case "defect_quarantine":
    case "adjust_out": setDecrease(); break;
    case "adjust_in": setIncrease(); break;
    case "dept_transfer": setMove(); break;
    default: matched = false;
  }

  // 2) sub_type 매핑 없거나 단품 BOM — direction fallback.
  if (!matched) {
    switch (line.direction) {
      case "in": setIncrease(); break;
      case "out": setDecrease(); break;
      case "move": setMove(); break;
      case "defective": setDecrease(); break;
      case "adjust":
        if (Number(line.quantity) >= 0) setIncrease();
        else setDecrease();
        break;
      default:
        sign = "+"; tone = "muted"; label = _signed("+", qty, unit);
    }
  }

  // 3) 제외 라인은 색만 약하게 (label 형식 유지).
  if (!line.included) tone = "muted";

  return { sign, label, tone, isApplied: line.included };
}

// ──────────────────────────────────────────────────────────────────
// 변동요약 — movement-summary-2026-05-15.
// `포함/제외` 검수 카운트 대신 작업 종류별로 "무엇이 얼마나 움직였나"를 보여줌.
// included 라인만 합산. 단위 섞이면 합 X. 부족은 라인 수 카운트.
// ──────────────────────────────────────────────────────────────────

export type MovementTone = "primary" | "success" | "info" | "warning" | "danger" | "muted";

export interface MovementSummaryPart {
  label: string;
  tone: MovementTone;
}

export interface MovementSummary {
  parts: MovementSummaryPart[];
  /** "부족 N" 같은 빨간 경고 텍스트. parts 와 같은 줄에 · 로 구분 노출. */
  warning?: string;
}

/** 백엔드 Decimal 직렬화로 quantity 가 string 으로 올 수 있음 → 안전 변환. */
function _toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function _formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(2).replace(/\.?0+$/, "");
}

/** 모든 included 라인이 동일 단위면 합·단위 반환, 섞이면 null. */
function _uniformQty(lines: { quantity: number; unit: string }[]): { sum: number; unit: string } | null {
  if (lines.length === 0) return null;
  const unit = lines[0].unit;
  let sum = 0;
  for (const l of lines) {
    if (l.unit !== unit) return null;
    sum += Math.abs(_toNum(l.quantity));
  }
  return { sum, unit };
}

/** distinct item_id 카운트. */
function _distinctItemCount(lines: { item_id: string }[]): number {
  const ids = new Set<string>();
  for (const l of lines) ids.add(l.item_id);
  return ids.size;
}

/** 이동/입고/출고 공통 라벨 빌더. */
function _verbItemPart(
  verb: string,
  tone: MovementTone,
  included: { item_id: string; quantity: number; unit: string }[],
): MovementSummaryPart {
  const itemCount = _distinctItemCount(included);
  const uni = _uniformQty(included);
  const label = uni
    ? `${verb} ${itemCount}품목 · ${_formatNumber(uni.sum)} ${uni.unit}`
    : `${verb} ${itemCount}품목`;
  return { label, tone };
}

/**
 * BOM/op_batch 묶음의 변동요약. batch 미로드 시 "하위 N건" fallback.
 * - sub_type 우선, 없으면 transaction_type 으로 분기.
 * - 부족 라인이 있으면 `warning: "부족 K"` (라인 수).
 */
export function getHistoryMovementSummary(
  log: { transaction_type: string },
  batch?: IoBatch | null,
  fallbackLogCount?: number,
): MovementSummary {
  if (!batch) {
    return {
      parts: [{ label: `하위 ${fallbackLogCount ?? 0}건`, tone: "muted" }],
    };
  }

  const included: typeof batch.bundles[number]["lines"] = [];
  let shortageCount = 0;
  for (const b of batch.bundles) {
    for (const l of b.lines) {
      if (l.included) included.push(l);
      if (l.included && l.shortage > 0) shortageCount++;
    }
  }

  const sub = batch.sub_type;
  const tx = log.transaction_type;
  const parts: MovementSummaryPart[] = [];

  if (sub === "produce" || tx === "PRODUCE" || sub === "disassemble" || tx === "DISASSEMBLE") {
    // 부모 라인은 상위 합, 같은 BOM 번들의 나머지 included 라인은 하위 합.
    // helper 단일화로 펼친 BOM 라인의 부모 흡수와 변동요약 합계가 자동 일치.
    const isRework = sub === "disassemble" || tx === "DISASSEMBLE";
    let topSum = 0, childSum = 0;
    let topUnit: string | null = null, childUnit: string | null = null;
    let topUnitMixed = false, childUnitMixed = false;

    for (const b of batch.bundles) {
      const parent = getHistoryBomParentLine(b);
      for (const l of b.lines) {
        if (!l.included) continue;
        const qty = Math.abs(_toNum(l.quantity));
        const u = (l.unit ?? "").trim();
        if (parent && l === parent) {
          topSum += qty;
          if (topUnit === null) topUnit = u;
          else if (topUnit !== u) topUnitMixed = true;
        } else if (b.source_kind === "bom_parent") {
          childSum += qty;
          if (childUnit === null) childUnit = u;
          else if (childUnit !== u) childUnitMixed = true;
        }
      }
    }

    // parent 못 찾고 BOM 번들의 quantity 만 있는 예외 케이스 fallback
    if (topSum === 0) {
      topSum = batch.bundles.reduce(
        (s, b) => s + (b.source_kind === "bom_parent" ? _toNum(b.quantity) : 0),
        0,
      );
      topUnit = null;  // fallback 은 단위 모름
    }

    const topUnitLabel = topUnit && !topUnitMixed ? ` ${topUnit}` : "";
    const childUnitLabel = childUnit && !childUnitMixed ? ` ${childUnit}` : "";

    if (topSum > 0) parts.push({
      label: `상위 ${_formatNumber(topSum)}${topUnitLabel}`,
      tone: isRework ? "danger" : "primary",
    });
    if (childSum > 0) parts.push({
      label: `하위 ${_formatNumber(childSum)}${childUnitLabel}`,
      tone: isRework ? "primary" : "danger",
    });
  } else if (sub === "warehouse_to_dept" || sub === "dept_to_warehouse" || sub === "dept_transfer"
    || tx === "TRANSFER_TO_PROD" || tx === "TRANSFER_TO_WH" || tx === "TRANSFER_DEPT") {
    parts.push(_verbItemPart("이동", "info", included));
  } else if (sub === "receive_supplier" || tx === "RECEIVE") {
    parts.push(_verbItemPart("입고", "success", included));
  } else if (tx === "SHIP") {
    parts.push(_verbItemPart("출고", "danger", included));
  } else if (sub === "supplier_return" || tx === "SUPPLIER_RETURN") {
    parts.push({ label: `반품 ${_distinctItemCount(included)}품목`, tone: "danger" });
  } else if (sub === "defect_quarantine" || tx === "MARK_DEFECTIVE") {
    parts.push({ label: `불량 ${_distinctItemCount(included)}품목`, tone: "danger" });
  } else if (sub === "adjust_in" || sub === "adjust_out" || tx === "ADJUST") {
    let increase = 0;
    let decrease = 0;
    for (const l of included) {
      const q = _toNum(l.quantity);
      if (q > 0) increase += q;
      else if (q < 0) decrease += Math.abs(q);
    }
    if (increase > 0) parts.push({ label: `증가 ${_formatNumber(increase)}`, tone: "success" });
    if (decrease > 0) parts.push({ label: `감소 ${_formatNumber(decrease)}`, tone: "danger" });
    if (parts.length === 0) parts.push({ label: "수량 조정", tone: "warning" });
  }

  // BACKFLUSH / disassemble / 그 외 매핑 없는 케이스 → 라인 수 fallback
  if (parts.length === 0) {
    parts.push({ label: `하위 ${included.length}건`, tone: "muted" });
  }

  const summary: MovementSummary = { parts };
  if (shortageCount > 0) summary.warning = `부족 ${shortageCount}`;
  return summary;
}

// ──────────────────────────────────────────────────────────────────
// 흐름 디스크립터 — 화면 노출용.
// "여러 위치 → 여러 위치" 같은 기계적 라벨을 작업 의도 + 보조 설명으로 치환.
// ──────────────────────────────────────────────────────────────────

export interface FlowDescriptor {
  /** 대표 라벨 — 작업 의도 또는 위치 흐름. */
  primary: string;
  /** 보조 설명 — 구성 변화 또는 endpoint 요약. */
  secondary?: string;
}

/** mixed 끝점 set 의 사람-친화 요약. 0/1/소수/다수 분기. */
function _summarizeSlots(batch: IoBatch, side: "from" | "to"): string {
  const labels = new Set<string>();
  for (const bundle of batch.bundles) {
    for (const line of bundle.lines) {
      const bucket = side === "from" ? line.from_bucket : line.to_bucket;
      const dept = _deptName(side === "from" ? line.from_department : line.to_department);
      const lbl = _labelBucketSlot({ bucket, dept }, batch.sub_type, side);
      if (lbl) labels.add(lbl);
    }
  }
  if (labels.size === 0) return "?";
  if (labels.size === 1) return Array.from(labels)[0];
  if (labels.size <= 3) return Array.from(labels).join(", ");
  return `${labels.size}개 위치`;
}

export function describeBatchFlow(
  log: { transaction_type: string },
  batch?: IoBatch | null,
): FlowDescriptor {
  // primary 는 항상 작업 의도. 화면 정본 라벨로 통일.
  const primary = getHistoryDisplayLabel(log, batch);
  if (!batch) return { primary };

  // secondary 우선순위: 1) sub_type/tx 의미문구  2) 단일 명확한 흐름  3) mixed 요약
  const subFromMap = getHistoryDisplaySubLabel(log, batch);
  if (subFromMap) return { primary, secondary: subFromMap };

  // 의미문구 없고 mixed 면 끝점 요약 (구성 변화가 큰 묶음 — 부서 단일 추론은 _singleProductionDept).
  const eps = getBatchFlowEndpoints(batch);
  if (eps?.mixed) {
    const fromSummary = _summarizeSlots(batch, "from");
    const toSummary = _summarizeSlots(batch, "to");
    return { primary, secondary: `${fromSummary} → ${toSummary}` };
  }
  return { primary };
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

/** dateFilter 값(`TODAY`/`WEEK`/`MONTH`/`ALL`) → date_from 쿼리 파라미터(YYYY-MM-DD). */
export function dateFilterToFrom(dateFilter: string): string | undefined {
  const d = getPeriodStart(dateFilter);
  if (!d) return undefined;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
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

/** 우측 상세 메타용 정본 형식 — `2026년 5월 14일    14시 21분` (초 제외). */
export function formatHistoryDateTimeLong(iso: string): string {
  const d = parseUtc(iso);
  const yyyy = d.getFullYear();
  const m = d.getMonth() + 1;
  const dd = d.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}년 ${m}월 ${dd}일    ${hh}시 ${min}분`;
}

export function toDateKey(iso: string): string {
  const d = parseUtc(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
