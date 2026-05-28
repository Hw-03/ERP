/**
 * historyBatchInterpreter.ts — IoBatch 기반 해석 모듈 (깊은 모듈).
 * C4: historyShared.ts 에서 추출. batch/log 를 받아 label/flow/sign/summary 를 단일 로직으로 생성.
 * 내부 bucket→라벨 규칙, sub_type/tx 우선순위를 이 모듈에 은닉.
 * 소비자는 historyShared 재export 또는 직접 import.
 */
import type { Department } from "@/lib/api/types/shared";
import type { IoBatch } from "@/lib/api/types/io";
import { formatQty } from "@/lib/mes/format";

// ──────────────────────────────────────────────────────────────────
// 내부 헬퍼
// ──────────────────────────────────────────────────────────────────

function _deptName(dept: Department | string | null | undefined): string | null {
  if (!dept) return null;
  return typeof dept === "string" ? dept : null;
}

type BucketSlot = { bucket: string; dept: string | null };

function _bucketSlotKey(s: BucketSlot): string {
  return `${s.bucket}|${s.dept ?? ""}`;
}

/** none bucket 라벨 — sub_type 컨텍스트 의존. 매핑 안 되면 null. */
function _labelNoneBucket(subType: string | null | undefined, side: "from" | "to"): string | null {
  switch (subType) {
    case "receive_supplier":
      return side === "from" ? "외부" : null;
    case "supplier_return":
      return side === "to" ? "외부" : null;
    case "produce":
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

// ──────────────────────────────────────────────────────────────────
// BatchFlowEndpoints
// ──────────────────────────────────────────────────────────────────

export interface BatchFlowEndpoints {
  from: string;
  to: string;
  /** 끝점 중 하나 이상이 라인마다 다른 위치를 가질 때. 그 끝점은 "여러 위치"로 표시됨. */
  mixed: boolean;
}

export function getBatchFlowEndpoints(batch: IoBatch): BatchFlowEndpoints | null {
  // 부서 내 작업(생산·재작업 등 batch.from_department == batch.to_department) 은
  // 부모(out)/자식(in) 라인이 반대 방향이라 _bucketSlot mix 가 발생하지만,
  // 사용자 인지상 "한 부서 안에서 끝나는 작업" — 그 부서로 단일 표기.
  // 단, 창고 관련 sub_type(receive_supplier, warehouse_to_dept 등)은 bucket 분석 필요.
  const subType = batch.sub_type ?? null;
  const sameDeptOnlyTypes = new Set(["produce", "disassemble", "adjust_in", "adjust_out"]);
  const batchFrom = _deptName(batch.from_department);
  const batchTo = _deptName(batch.to_department);
  if (batchFrom && batchTo && batchFrom === batchTo && (!subType || sameDeptOnlyTypes.has(subType))) {
    return { from: batchFrom, to: batchTo, mixed: false };
  }

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

// ──────────────────────────────────────────────────────────────────
// 라벨 맵
// ──────────────────────────────────────────────────────────────────

/**
 * TransactionLog.notes 파싱 — 시스템 자동 생성 메타와 사용자가 직접 입력한 메모를 분리.
 *
 * 백엔드가 자동으로 채우는 패턴(6 종):
 *   1·2. "요청 (승인|즉시) 처리: {code} / {from} → {to} / {qty}개 / 요청자 {name}" (stock_requests.py)
 *      3. 위 1·2 끝에 " / 비고: {사용자 입력}" 가 덧붙는 경우 — 비고만이 사용자 메모
 *      4. "[dept_adj:{sub}] {op}: {reason}" (dept_adjustment.py) — reason 이 사용자 입력
 *      5. "[defect_disassemble(:keep|:scrap)?] {note}" (dept_adjustment.py) — note 가 사용자 입력
 *      6. "[격리] {src} → {tgt}" / "[정상복귀] {dept}" (defects.py) — 사용자 입력 없음
 *
 * 위 6 종 외엔 입출고 2.0 wizard 에서 사용자가 직접 입력한 비고(batch.notes 그대로) → 전체가 사용자 메모.
 *
 * 반환: `userMemo` (null 이면 사용자 메모 없음 — UI 에서 메모 카드/알약 미노출).
 */
export function parseTransactionNotes(notes: string | null | undefined): {
  userMemo: string | null;
} {
  const text = notes?.trim();
  if (!text) return { userMemo: null };

  // 1·2·3: 요청 (승인|즉시) 처리 — "/ 비고: ..." 가 있으면 그 부분만 사용자 메모.
  if (/^요청 (?:승인|즉시) 처리:/.test(text)) {
    const parts = text.split(/\s*\/\s*비고:\s*/);
    const userPart = parts.length > 1 ? parts.slice(1).join(" / 비고: ").trim() : "";
    return { userMemo: userPart || null };
  }

  // 4: [dept_adj:{sub}] {op}: {reason} — reason 추출
  const adjMatch = text.match(/^\[dept_adj:[^\]]+\][^:]*:\s*(.*)$/);
  if (adjMatch) {
    const reason = adjMatch[1]?.trim() ?? "";
    return { userMemo: reason || null };
  }

  // 5a: [defect_disassemble] {category}: {memo}
  const disPMatch = text.match(/^\[defect_disassemble\][^:]*:\s*(.*)$/);
  if (disPMatch) {
    const memo = disPMatch[1]?.trim() ?? "";
    return { userMemo: memo || null };
  }

  // 5b/5c: [defect_disassemble:keep|scrap] {childNote}
  const disCMatch = text.match(/^\[defect_disassemble:(?:keep|scrap)\]\s*(.*)$/);
  if (disCMatch) {
    const child = disCMatch[1]?.trim() ?? "";
    return { userMemo: child || null };
  }

  // 6: 격리: / 정상 복귀: — 사용자 입력 없음
  if (/^격리:/.test(text) || /^정상 복귀:/.test(text)) {
    return { userMemo: null };
  }
  // 6(legacy): [격리] / [정상복귀] 이전 형식도 호환
  if (/^\[격리\]\s/.test(text) || /^\[정상복귀\]/.test(text)) {
    return { userMemo: null };
  }

  // 알려진 시스템 prefix 아님 → 전체가 사용자 메모
  return { userMemo: text };
}

const _SUB_TYPE_OPERATION: Record<string, string> = {
  produce: "생산 | 입고",
  disassemble: "분해 | 출고",
  warehouse_to_dept: "창고 반출",
  dept_to_warehouse: "창고 반입",
  dept_transfer: "부서 이동",
  adjust_in: "수량 조정",
  adjust_out: "수량 조정",
  receive_supplier: "원자재 입고",
  supplier_return: "원자재 반품",
  defect_quarantine: "새 격리",
  defect_restore: "격리 해제",
  defect_process: "격리 폐기",
};

const _TX_OPERATION: Record<string, string> = {
  RECEIVE: "원자재 입고",
  SHIP: "출고",
  TRANSFER_TO_PROD: "창고 반출",
  TRANSFER_TO_WH: "창고 반입",
  TRANSFER_DEPT: "부서 이동",
  BACKFLUSH: "자동 차감",
  PRODUCE: "생산 | 입고",
  DISASSEMBLE: "분해 | 출고",
  ADJUST: "수량 조정",
  MARK_DEFECTIVE: "새 격리",
  UNMARK_DEFECTIVE: "격리 해제",
  DEFECT_SCRAP: "폐기",
  SUPPLIER_RETURN: "원자재 반품",
};

const _DISPLAY_SUB_LABEL: Record<string, string> = {
  // sub_type
  produce: "부품 차감 + 완제품 입고",
  receive_supplier: "창고로 들어옴",
  warehouse_to_dept: "창고에서 부서로 이동",
  dept_to_warehouse: "부서에서 창고로 이동",
  defect_quarantine: "정상 재고 → 불량 재고",
  defect_restore: "불량 재고 → 정상 재고",
  defect_process: "불량 재고 폐기",
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
  UNMARK_DEFECTIVE: "불량 재고 → 정상 재고",
  DEFECT_SCRAP: "불량 재고 폐기",
  SUPPLIER_RETURN: "불량 재고 공급사 반품",
};

// ──────────────────────────────────────────────────────────────────
// 공개 함수 — 라벨/흐름/actor
// ──────────────────────────────────────────────────────────────────

/** 작업 의도 라벨. batch.sub_type 우선, 없으면 transaction_type 기반. */
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

const _WORK_TYPE_LABEL: Record<string, string> = {
  receive: "원자재 입고",
  warehouse_io: "창고 입출고",
  process: "부서 작업",
  defect: "불량",
};

/** IoBatch.work_type 코드의 한글 라벨. 미매핑이면 원문 그대로(안전). */
export function getHistoryWorkTypeLabel(workType: string): string {
  return _WORK_TYPE_LABEL[workType] ?? workType;
}

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

/** 작업 흐름 라벨. batch 있고 명확하면 부서/창고/불량/생산 등으로, 그 외 거래 타입 추론. */
export function getHistoryFlowLabel(
  log: { transaction_type: string },
  batch?: IoBatch | null,
): string {
  if (batch) {
    const eps = getBatchFlowEndpoints(batch);
    if (eps) return `${eps.from} → ${eps.to}`;
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
    case "MARK_DEFECTIVE": return "새 격리";
    case "UNMARK_DEFECTIVE": return "격리 해제";
    case "DEFECT_SCRAP": return "폐기";
    case "ADJUST": return "수량 조정";
    case "SUPPLIER_RETURN": return "원자재 반품";
    default: return log.transaction_type;
  }
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

// ──────────────────────────────────────────────────────────────────
// FlowDescriptor
// ──────────────────────────────────────────────────────────────────

export interface FlowDescriptor {
  /** 대표 라벨 — 작업 의도 또는 위치 흐름. */
  primary: string;
  /** 보조 설명 — 구성 변화 또는 endpoint 요약. */
  secondary?: string;
}

/** mixed 끝점 set 의 사람-친화 요약. */
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
  const primary = getHistoryDisplayLabel(log, batch);
  if (!batch) return { primary };

  const subFromMap = getHistoryDisplaySubLabel(log, batch);
  if (subFromMap) return { primary, secondary: subFromMap };

  const eps = getBatchFlowEndpoints(batch);
  if (eps?.mixed) {
    const fromSummary = _summarizeSlots(batch, "from");
    const toSummary = _summarizeSlots(batch, "to");
    return { primary, secondary: `${fromSummary} → ${toSummary}` };
  }
  return { primary };
}

// ──────────────────────────────────────────────────────────────────
// BOM 라인 헬퍼
// ──────────────────────────────────────────────────────────────────

/** BOM bundle 의 부모 라인(BOM 자기 자신) 반환. 단품 번들/없으면 null. */
export function getHistoryBomParentLine<L extends { origin: string }>(
  bundle: { source_kind?: string | null; lines: L[] } | null | undefined,
): L | null {
  if (!bundle || bundle.source_kind !== "bom_parent") return null;
  return bundle.lines.find((l) => l.origin === "direct") ?? null;
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

// ──────────────────────────────────────────────────────────────────
// LineSignedQty
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
      else matched = false;
      break;
    case "disassemble":
      if (isBomParent) setDecrease();
      else if (isBomChild) setIncrease();
      else matched = false;
      break;
    case "warehouse_to_dept":
    case "dept_to_warehouse":
      // 창고 ↔ 부서는 위치 이동이라 +/- 의 의미가 없음. BOM 상위 헤더 plain 표시와 통일.
      sign = ""; tone = "muted"; label = _withUnit(qty, unit);
      break;
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
// MovementSummary
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

function _toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function _formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(2).replace(/\.?0+$/, "");
}

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

function _distinctItemCount(lines: { item_id: string }[]): number {
  const ids = new Set<string>();
  for (const l of lines) ids.add(l.item_id);
  return ids.size;
}

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

    if (topSum === 0) {
      topSum = batch.bundles.reduce(
        (s, b) => s + (b.source_kind === "bom_parent" ? _toNum(b.quantity) : 0),
        0,
      );
      topUnit = null;
    }

    const topUnitLabel = topUnit && !topUnitMixed ? ` ${topUnit}` : "";
    const childUnitLabel = childUnit && !childUnitMixed ? ` ${childUnit}` : "";

    if (topSum > 0) parts.push({
      label: `상위 ${isRework ? "-" : "+"}${_formatNumber(topSum)}${topUnitLabel}`,
      tone: isRework ? "danger" : "primary",
    });
    if (childSum > 0) parts.push({
      label: `하위 ${isRework ? "+" : "-"}${_formatNumber(childSum)}${childUnitLabel}`,
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
  } else if (sub === "defect_restore" || tx === "UNMARK_DEFECTIVE") {
    parts.push({ label: `해제 ${_distinctItemCount(included)}품목`, tone: "success" });
  } else if (sub === "defect_process" || tx === "DEFECT_SCRAP") {
    parts.push({ label: `폐기 ${_distinctItemCount(included)}품목`, tone: "danger" });
  } else if (sub === "adjust_in" || sub === "adjust_out" || tx === "ADJUST") {
    const inc: typeof included = [];
    const dec: typeof included = [];
    for (const l of included) {
      const q = _toNum(l.quantity);
      if (q > 0) inc.push(l);
      else if (q < 0) dec.push(l);
    }
    if (inc.length > 0) parts.push(_verbItemPart("증가", "success", inc));
    if (dec.length > 0) parts.push(_verbItemPart("감소", "danger", dec));
    if (parts.length === 0) parts.push({ label: "수량 조정", tone: "warning" });
  }

  if (parts.length === 0) {
    parts.push({ label: `하위 ${included.length}건`, tone: "muted" });
  }

  const summary: MovementSummary = { parts };
  if (shortageCount > 0) summary.warning = `부족 ${shortageCount}`;
  return summary;
}

// ──────────────────────────────────────────────────────────────────
// 단건(낱개) 변동요약 — BOM 묶음과 같은 알약/tone 으로 통일 (3차 C6).
// 의미를 "총재고 증감(+0/+N)" → "무슨 작업으로 몇 개 움직였나"로 재정의.
// 수량 출처: transfer_qty ?? abs(quantity_change). ADJUST 만 부호 유지.
// 둘 다 0/null 인 레거시는 동사만(절대 "+0" 표기 안 함).
// ──────────────────────────────────────────────────────────────────

const _SINGLE_OP: Record<string, { verb: string; tone: MovementTone; signed?: boolean }> = {
  RECEIVE: { verb: "입고", tone: "success" },
  SHIP: { verb: "출고", tone: "danger" },
  ADJUST: { verb: "조정", tone: "warning", signed: true },
  TRANSFER_TO_PROD: { verb: "이동", tone: "info" },
  TRANSFER_TO_WH: { verb: "이동", tone: "info" },
  TRANSFER_DEPT: { verb: "이동", tone: "info" },
  BACKFLUSH: { verb: "자동 차감", tone: "danger" },
  PRODUCE: { verb: "생산", tone: "success" },
  DISASSEMBLE: { verb: "재작업", tone: "danger" },
  // 불량 처리 4종 — 전부 danger 톤, 라벨은 구분 알약과 동일
  MARK_DEFECTIVE: { verb: "새 격리", tone: "danger" },
  UNMARK_DEFECTIVE: { verb: "격리 해제", tone: "success" },
  DEFECT_SCRAP: { verb: "폐기", tone: "danger" },
  SUPPLIER_RETURN: { verb: "원자재 반품", tone: "danger" },
};

export function getSingleLogMovement(log: {
  transaction_type: string;
  transfer_qty?: number | null;
  quantity_change: number | string;
  item_unit?: string | null;
}): MovementSummaryPart {
  const conf = _SINGLE_OP[log.transaction_type] ?? { verb: "변동", tone: "muted" as MovementTone };
  const unit = (log.item_unit ?? "").trim();
  const suffix = unit ? ` ${unit}` : "";
  const qc = Number(log.quantity_change);

  if (conf.signed) {
    const sign = qc >= 0 ? "+" : "-";
    return { label: `${conf.verb} ${sign}${formatQty(Math.abs(qc))}${suffix}`, tone: conf.tone };
  }

  const moved = log.transfer_qty != null ? Number(log.transfer_qty) : Math.abs(qc);
  if (!Number.isFinite(moved) || moved === 0) {
    return { label: conf.verb, tone: conf.tone };
  }
  return { label: `${conf.verb} ${formatQty(moved)}${suffix}`, tone: conf.tone };
}
