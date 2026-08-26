/**
 * historyBatchInterpreter.ts — IoBatch 기반 해석 모듈 (깊은 모듈).
 * C4: historyShared.ts 에서 추출. batch/log 를 받아 label/flow/sign/summary 를 단일 로직으로 생성.
 * 내부 bucket→라벨 규칙, sub_type/tx 우선순위를 이 모듈에 은닉.
 * 소비자는 historyShared 재export 또는 직접 import.
 */
import type { Department, TransactionType } from "@/lib/api/types/shared";
import type { IoBatch, IoBundle, IoLine } from "@/lib/api/types/io";
import type { TransactionLog } from "@/lib/api/types/production";
import { formatQty } from "@/lib/mes/format";
import {
  SUB_TYPE_LABEL as _SUB_LABEL,
  TRANSACTION_TYPE_LABEL as _TX_LABEL,
  WORK_TYPE_LABEL as _WORK_LABEL,
} from "@/lib/io/glossary";

// ──────────────────────────────────────────────────────────────────
// 내부 헬퍼
// ──────────────────────────────────────────────────────────────────

function _deptName(dept: Department | string | null | undefined): string | null {
  if (!dept) return null;
  return typeof dept === "string" ? dept : null;
}

type BucketSlot = { bucket: string; dept: string | null };

/** 과거 중복 클릭으로 생긴 동일 수동 단품 묶음을 표시 단계에서만 합친다. */
export function getDisplayBundles(batch: IoBatch): IoBundle[] {
  const merged = new Map<string, IoBundle>();

  for (const bundle of batch.bundles) {
    const line = bundle.lines[0];
    const manual = bundle.source_kind === "manual" && bundle.lines.length < 2;
    const key = manual ? line.item_id : bundle.bundle_id;
    const existing = merged.get(key);
    if (existing) {
      existing.lines[0].quantity += line.quantity;
    } else {
      merged.set(key, manual ? { ...bundle, lines: [{ ...line }] } : bundle);
    }
  }
  return Array.from(merged.values());
}

/** 과거에 produce로 저장됐지만 실제로는 수동 단품 증가뿐인 배치인지 판별한다. */
export function isManualOnlyProductionBatch(batch: IoBatch | null | undefined): boolean {
  if (batch?.sub_type !== "produce" || batch.bundles.length === 0) return false;
  return batch.bundles.every((bundle) => {
    const included = bundle.lines.filter((line) => line.included);
    return bundle.source_kind === "manual"
      && included.length > 0
      && included.every((line) =>
        line.origin === "manual"
        && line.direction === "in"
        && line.from_bucket === "none"
        && line.to_bucket === "production",
      );
  });
}

function _historySubType(batch: IoBatch): string {
  return isManualOnlyProductionBatch(batch) ? "adjust_in" : batch.sub_type;
}

function _internalUseDepartment(
  log: { department?: string | null },
  batch?: IoBatch | null,
): string | null {
  return _deptName(batch?.to_department) ?? log.department?.trim() ?? null;
}

function _internalUseDestination(department: string | null): string {
  if (department === "연구") return "연구소";
  return department || "AS·연구";
}

function _internalUseOperationLabel(
  log: { transaction_type: string; department?: string | null; item_id?: string | null },
  batch?: IoBatch | null,
): string {
  const returnLine = _internalUseReturnLine(log, batch);
  if (returnLine) {
    const department = _deptName(returnLine.to_department) ?? log.department?.trim() ?? null;
    return `${_internalUseDestination(department)} 재입고`;
  }
  return `${_internalUseDestination(_internalUseDepartment(log, batch))} 반출`;
}

function _internalUseLineForLog(
  log: { transaction_type: string; item_id?: string | null },
  batch?: IoBatch | null,
): IoLine | null {
  if (batch?.sub_type !== "internal_use_out" || !log.item_id) return null;
  const matches = batch.bundles.flatMap((bundle) =>
    bundle.lines.filter((line) => line.included && line.item_id === log.item_id),
  );
  if (matches.length === 0) return null;
  const expectedDirection = log.transaction_type === "PRODUCE" || log.transaction_type === "RECEIVE"
    ? "in"
    : log.transaction_type === "INTERNAL_USE" || log.transaction_type === "BACKFLUSH"
      ? "out"
      : null;
  return matches.find((line) => expectedDirection == null || line.direction === expectedDirection)
    ?? matches[0];
}

function _internalUseReturnLine(
  log: { transaction_type: string; item_id?: string | null },
  batch?: IoBatch | null,
): IoLine | null {
  const line = _internalUseLineForLog(log, batch);
  return line?.direction === "in"
    && line.from_bucket === "none"
    && line.to_bucket === "production"
    ? line
    : null;
}

export type InternalUseHistoryLineResolution =
  | "applied"
  | "pending"
  | "rejected"
  | "none";

export function getInternalUseHistoryLineResolution(
  line: IoLine,
  batch?: IoBatch | null,
): InternalUseHistoryLineResolution {
  if (!line.included) return "none";
  const request = batch?.stock_requests?.find((candidate) =>
    candidate.operation_line_ids?.includes(line.line_id),
  );
  // 과거 배치는 요청별 라인 연결이 없으므로 기존 완료 이력 표시를 유지한다.
  if (!request) return "applied";
  const status = request.status.toUpperCase();
  if (status === "COMPLETED") return "applied";
  if (status === "RESERVED" || status === "SUBMITTED") return "pending";
  return "rejected";
}

export function getInternalUseHistoryLineEffectLabel(
  line: IoLine,
  batch?: IoBatch | null,
): string {
  if (line.bom_stock_exempt) return "재고 미반영";
  if (!line.included) return "변동 없음";
  const isReturn =
    !(line.selected ?? line.included) &&
    line.direction === "in" &&
    line.from_bucket === "none" &&
    line.to_bucket === "production";
  const resolution = getInternalUseHistoryLineResolution(line, batch);
  if (resolution === "pending") {
    return isReturn ? "재입고 승인 대기" : "출고 승인 대기";
  }
  if (resolution === "rejected") {
    return isReturn ? "재입고 반려/미반영" : "출고 반려/미반영";
  }
  return isReturn ? "소속 부서 재입고" : "출고";
}

export function getHistoryDisplayTransactionType(
  log: { transaction_type: TransactionType },
  batch?: IoBatch | null,
): TransactionType;
export function getHistoryDisplayTransactionType(
  log: { transaction_type: string },
  batch?: IoBatch | null,
): string;
export function getHistoryDisplayTransactionType(
  log: { transaction_type: string },
  batch?: IoBatch | null,
): string {
  return isManualOnlyProductionBatch(batch) ? "ADJUST" : log.transaction_type;
}

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
      return _SUB_LABEL.produce;
    case "disassemble":
      return "재작업";
    case "adjust_in":
    case "adjust_out":
    case "warehouse_adjust_in":
    case "warehouse_adjust_out":
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
  const subType = _historySubType(batch);
  if (subType === "internal_use_out") {
    return {
      from: "창고",
      to: _internalUseDestination(_deptName(batch.to_department)),
      mixed: false,
    };
  }
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

export function isShippingCompanionNote(notes: string | null | undefined): boolean {
  return /^(?:동반\s+출하|출하\s+동반\s+품목)\s*:/.test(notes?.trim() ?? "");
}

/**
 * TransactionLog.notes 파싱 — 시스템 자동 생성 메타와 사용자가 직접 입력한 메모를 분리.
 *
 * 백엔드가 자동으로 채우는 패턴(8 종):
 *   1·2. "요청 (승인|즉시) 처리: {code} / {from} → {to} / {qty}개 / 요청자 {name}" (stock_requests.py)
 *      3. 위 1·2 끝에 " / 비고: {사용자 입력}" 가 덧붙는 경우 — 비고만이 사용자 메모
 *      4. "[dept_adj:{sub}] {op}: {reason}" (dept_adjustment.py) — reason 이 사용자 입력
 *      5. "[defect_disassemble(:keep|:scrap)?] {note}" (dept_adjustment.py) — note 가 사용자 입력
 *      6. "[격리] {src} → {tgt}" / "[정상복귀] {dept}" (defects.py) — 사용자 입력 없음
 *      7. "[rework:{kind}]" (재작업 자동 생성) — 사용자 입력 없음
 *      8. "동반 출하: {품목명}" / "출하 동반 품목: {품목명}" — 사용자 입력 없음
 *
 * 위 8 종 외엔 입출고 2.0 wizard 에서 사용자가 직접 입력한 비고(batch.notes 그대로) → 전체가 사용자 메모.
 *
 * 반환: `userMemo` (null 이면 사용자 메모 없음 — UI 에서 메모 카드/알약 미노출).
 */
export function parseTransactionNotes(
  notes: string | null | undefined,
  transactionType?: TransactionType,
): {
  userMemo: string | null;
} {
  const text = notes?.trim();
  if (!text) return { userMemo: null };
  if (isGeneratedHistorySystemNote(text, transactionType)) return { userMemo: null };

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

function isGeneratedHistorySystemNote(text: string, transactionType?: TransactionType): boolean {
  if (text.startsWith("??") || text.includes("\uFFFD")) return true;
  if (/^\[rework:[^\]]+\]/.test(text)) return true;
  if (transactionType === "SHIP" && isShippingCompanionNote(text)) return true;

  const systemFragments = [
    "품목 전환 소스",
    "품목 전환 대상",
    "품목 전환 추가 차감",
    "품목 전환 회수 입고",
    "출하 준비",
    "출하 픽업",
    "final PF",
  ];
  return systemFragments.some((fragment) => text.includes(fragment));
}

// 작업 의도 라벨 — base 라벨은 glossary에서 가져오되, history에서는 실제 처리 상태를 우선한다.
const _SUB_TYPE_OPERATION: Record<string, string> = {
  produce: _SUB_LABEL.produce,
  disassemble: "재작업",
  warehouse_to_dept: _SUB_LABEL.warehouse_to_dept,
  dept_to_warehouse: _SUB_LABEL.dept_to_warehouse,
  dept_transfer: _SUB_LABEL.dept_transfer,
  adjust_in: _SUB_LABEL.adjust_in,
  adjust_out: _SUB_LABEL.adjust_out,
  warehouse_adjust_in: _TX_LABEL.ADJUST,
  warehouse_adjust_out: _TX_LABEL.ADJUST,
  receive_supplier: _SUB_LABEL.receive_supplier,
  supplier_return: _SUB_LABEL.supplier_return,
  defect_quarantine: "불량 격리",
  defect_restore: "정상 복귀",
  defect_process: "폐기",
  internal_use_out: _SUB_LABEL.internal_use_out,
};

const _TX_OPERATION: Record<string, string> = {
  ..._TX_LABEL,
  DISASSEMBLE: "재작업",
  MARK_DEFECTIVE: "불량 격리",
  UNMARK_DEFECTIVE: "정상 복귀",
  DEFECT_SCRAP: "폐기",
  SUPPLIER_RETURN: "반품",
};

/** 하위 폐기 결과를 선택해도 부모 batch 작업 맥락을 유지할 작업명. */
const _CHILD_RESULT_BATCH_OPERATION: Record<string, string> = {
  disassemble: "재작업",
  defect_quarantine: "불량 격리",
  defect_restore: "정상 복귀",
};

const _DISPLAY_SUB_LABEL: Record<string, string> = {
  // sub_type
  produce: "부품 차감 + 완제품 입고",
  receive_supplier: "창고로 들어옴",
  warehouse_to_dept: "창고에서 부서로 이동",
  dept_to_warehouse: "부서에서 창고로 이동",
  defect_quarantine: "격리",
  defect_restore: "격리 해제",
  defect_process: "폐기",
  supplier_return: "공급사로 돌려보냄",
  internal_use_out: "창고에서 AS·연구 용도로 반출",
  adjust_in: "재고 수량 직접 수정",
  adjust_out: "재고 수량 직접 수정",
  warehouse_adjust_in: "창고 재고 수량 직접 수정",
  warehouse_adjust_out: "창고 재고 수량 직접 수정",
  // transaction_type
  RECEIVE: "창고로 들어옴",
  SHIP: "회사 밖으로 나감",
  ADJUST: "재고 수량 직접 수정",
  BACKFLUSH: "BOM 기준 부품 차감",
  PRODUCE: "부품 차감 + 완제품 입고",
  TRANSFER_TO_PROD: "창고에서 부서로 이동",
  TRANSFER_TO_WH: "부서에서 창고로 이동",
  MARK_DEFECTIVE: "격리",
  UNMARK_DEFECTIVE: "격리 해제",
  DEFECT_SCRAP: "폐기",
  SUPPLIER_RETURN: "불량 재고 공급사 반품",
  INTERNAL_USE: "창고에서 AS·연구 용도로 반출",
};

// ──────────────────────────────────────────────────────────────────
// 공개 함수 — 라벨/흐름/actor
// ──────────────────────────────────────────────────────────────────

/** 작업 의도 라벨. batch.sub_type 우선, 없으면 transaction_type 기반. */
export function getHistoryOperationLabel(
  log: { transaction_type: string; department?: string | null; item_id?: string | null },
  batch?: IoBatch | null,
): string {
  const batchContext = getHistoryChildResultBatchOperationLabel(log, batch);
  if (batchContext) return batchContext;
  if (log.transaction_type === "DEFECT_SCRAP") {
    return _TX_OPERATION.DEFECT_SCRAP;
  }
  if (batch?.sub_type === "internal_use_out" || log.transaction_type === "INTERNAL_USE") {
    return _internalUseOperationLabel(log, batch);
  }
  if (batch?.sub_type) {
    const fromSub = _SUB_TYPE_OPERATION[_historySubType(batch)];
    if (fromSub) return fromSub;
  }
  return _TX_OPERATION[log.transaction_type] ?? log.transaction_type;
}

/** 하위 DEFECT_SCRAP 결과에 적용할 부모 batch 작업명. */
export function getHistoryChildResultBatchOperationLabel(
  log: { transaction_type: string },
  batch?: IoBatch | null,
): string | undefined {
  if (!batch) return undefined;
  if (_historySubType(batch) === "disassemble" && (log.transaction_type === "DEFECT_SCRAP" || log.transaction_type === "RECEIVE")) {
    return _CHILD_RESULT_BATCH_OPERATION.disassemble;
  }
  if (log.transaction_type !== "DEFECT_SCRAP") return undefined;
  return _CHILD_RESULT_BATCH_OPERATION[_historySubType(batch)];
}

const _WORK_TYPE_LABEL: Record<string, string> = _WORK_LABEL;

/** IoBatch.work_type 코드의 한글 라벨. 미매핑이면 원문 그대로(안전). */
export function getHistoryWorkTypeLabel(workType: string): string {
  return _WORK_TYPE_LABEL[workType] ?? workType;
}

/** 화면 정본 메인 라벨. 의도 우선. 모든 row/패널이 같은 정책으로 보이도록. */
export function getHistoryDisplayLabel(
  log: { transaction_type: string; department?: string | null; item_id?: string | null },
  batch?: IoBatch | null,
): string {
  return getHistoryOperationLabel(log, batch);
}

/** 화면 정본 보조문구. 의미문구 우선, 없고 단일 명확한 흐름이면 "{from} → {to}". */
export function getHistoryDisplaySubLabel(
  log: { transaction_type: string; department?: string | null; item_id?: string | null },
  batch?: IoBatch | null,
): string | undefined {
  if (_internalUseReturnLine(log, batch)) {
    return "선택 해제 자재를 소속 부서에 재입고";
  }
  if (batch?.sub_type) {
    const fromSub = _DISPLAY_SUB_LABEL[_historySubType(batch)];
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
  log: { transaction_type: string; department?: string | null; item_id?: string | null },
  batch?: IoBatch | null,
): string {
  const batchContext = getHistoryChildResultBatchOperationLabel(log, batch);
  if (batchContext) return batchContext;
  const returnLine = _internalUseReturnLine(log, batch);
  if (returnLine) {
    const department = _deptName(returnLine.to_department) ?? log.department?.trim() ?? null;
    return `사용출고 해제 → ${_internalUseDestination(department)}`;
  }
  if (batch?.sub_type === "internal_use_out" || log.transaction_type === "INTERNAL_USE") {
    return `창고 → ${_internalUseDestination(_internalUseDepartment(log, batch))}`;
  }
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
    case "DISASSEMBLE": return _TX_OPERATION.DISASSEMBLE;
    case "MARK_DEFECTIVE": return _TX_OPERATION.MARK_DEFECTIVE;
    case "UNMARK_DEFECTIVE": return _TX_OPERATION.UNMARK_DEFECTIVE;
    case "DEFECT_SCRAP": return _TX_OPERATION.DEFECT_SCRAP;
    case "ADJUST": return _TX_LABEL.ADJUST;
    case "SUPPLIER_RETURN": return _TX_LABEL.SUPPLIER_RETURN;
    case "INTERNAL_USE": return "창고 → AS·연구";
    default: return log.transaction_type;
  }
}

/** 표시자: 출하는 실제 준비 완료자, 그 외 작업은 요청자를 우선한다. */
export function getHistoryActor(log: {
  transaction_type?: string | null;
  requester_name?: string | null;
  produced_by?: string | null;
}): string {
  const candidates = log.transaction_type === "SHIP"
    ? [log.produced_by, log.requester_name]
    : [log.requester_name, log.produced_by];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const stripped = candidate.split("(")[0]?.trim();
    return stripped && stripped.length > 0 ? stripped : candidate;
  }
  return log.transaction_type === "SHIP" ? "담당자 미기록" : "-";
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

/** operation_line_id가 정확히 하나인 실행 거래만 이력 수량의 근거로 사용한다. */
export function getHistoryLineExecutionLog(
  line: Pick<IoLine, "line_id">,
  logs?: readonly TransactionLog[],
): TransactionLog | null {
  const matches = logs?.filter((log) => log.operation_line_id === line.line_id) ?? [];
  return matches.length === 1 ? matches[0] : null;
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
    selected?: boolean;
    bom_stock_exempt?: boolean;
    origin: string;
    direction: string;
    from_bucket?: string | null;
    to_bucket?: string | null;
    quantity: number | string;
    unit?: string | null;
  },
  batch?: { sub_type?: string | null } | null,
  bundle?: { source_kind?: string | null } | null,
  executionLog?: Pick<TransactionLog, "quantity_change" | "transaction_type" | "item_unit" | "transfer_qty"> | null,
): LineSignedQty {
  const executedQty = executionLog
    ? Math.abs(_toNum(executionLog.quantity_change)) || Math.abs(_toNum(executionLog.transfer_qty)) || Math.abs(_toNum(line.quantity))
    : null;
  const qty = _quantityFormat(executedQty ?? line.quantity);
  const unit = executionLog?.item_unit ?? line.unit ?? null;
  const isBomParent = bundle?.source_kind === "bom_parent" && line.origin === "direct";
  const isBomChild = bundle?.source_kind === "bom_parent" && line.origin !== "direct";
  const sub = batch?.sub_type;

  let sign: "+" | "-" | "" = "+";
  let label = "";
  let tone: LineSignTone = "increase";

  const setIncrease = () => { sign = "+"; tone = "increase"; label = _signed("+", qty, unit); };
  const setDecrease = () => { sign = "-"; tone = "decrease"; label = _signed("-", qty, unit); };
  const setMove = () => { sign = ""; tone = "move"; label = `이동 ${_withUnit(qty, unit)}`; };
  const setQuarantine = () => { sign = ""; tone = "decrease"; label = `격리 ${_withUnit(qty, unit)}`; };

  // 완료된 작업은 계획 IoLine보다 실제 실행 로그를 우선한다.
  if (executionLog) {
    const delta = _toNum(executionLog.quantity_change);
    if (delta > 0) setIncrease();
    else if (delta < 0) setDecrease();
    else if (line.direction === "defective" || executionLog.transaction_type === "MARK_DEFECTIVE") setQuarantine();
    else if (line.direction === "move" || executionLog.transaction_type.startsWith("TRANSFER_")) setMove();
    else { sign = ""; tone = "muted"; label = _withUnit(qty, unit); }

    if (!line.included) tone = "muted";
    return { sign, label, tone, isApplied: line.included };
  }

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
    case "internal_use_out":
      if (line.direction === "in") setIncrease();
      else setDecrease();
      break;
    case "warehouse_adjust_out": setDecrease(); break;
    case "adjust_in":
    case "warehouse_adjust_in": setIncrease(); break;
    case "dept_transfer": setMove(); break;
    default: matched = false;
  }

  // 2) sub_type 매핑 없거나 단품 BOM — direction fallback.
  if (!matched) {
    switch (line.direction) {
      case "in": setIncrease(); break;
      case "out": setDecrease(); break;
      case "move": setMove(); break;
      case "defective": setQuarantine(); break;
      case "adjust":
        if (line.from_bucket !== "none" && line.to_bucket === "none") setDecrease();
        else if (line.from_bucket === "none" && line.to_bucket !== "none") setIncrease();
        else { sign = ""; tone = "muted"; label = `조정 ${_withUnit(qty, unit)}`; }
        break;
      default:
        sign = "+"; tone = "muted"; label = _signed("+", qty, unit);
    }
  }

  // 3) 사용출고에서 거래가 생성되지 않은 라인은 감소처럼 보이지 않게 중립 표시한다.
  if (sub === "internal_use_out" && !line.included) {
    sign = "";
    label = _withUnit(qty, unit);
    tone = "muted";
  } else if (!line.included) {
    tone = "muted";
  }

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
  /** "제외 N" 같은 보조 수량 정보. */
  supplement?: {
    label: string;
    tone: "muted";
  };
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
  executedLogs?: readonly TransactionLog[],
): MovementSummary {
  if (!batch) {
    return {
      parts: [{ label: `세부 ${fallbackLogCount ?? 0}건`, tone: "muted" }],
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

  const sub = _historySubType(batch);
  const tx = getHistoryDisplayTransactionType(log, batch);
  const parts: MovementSummaryPart[] = [];

  if (sub === "internal_use_out" || tx === "INTERNAL_USE") {
    const applied = included.filter(
      (line) => getInternalUseHistoryLineResolution(line, batch) === "applied",
    );
    const pending = included.filter(
      (line) => getInternalUseHistoryLineResolution(line, batch) === "pending",
    );
    const rejected = included.filter(
      (line) => getInternalUseHistoryLineResolution(line, batch) === "rejected",
    );
    const outbound = applied.filter((line) => line.direction === "out");
    const returned = applied.filter((line) => line.direction === "in");
    if (outbound.length > 0) parts.push(_verbItemPart("출고", "danger", outbound));
    if (returned.length > 0) parts.push(_verbItemPart("재입고", "success", returned));
    if (pending.length > 0) parts.push(_verbItemPart("승인 대기", "warning", pending));
    if (rejected.length > 0) parts.push(_verbItemPart("반려/미반영", "muted", rejected));
  } else if (sub === "produce" || tx === "PRODUCE" || sub === "disassemble" || tx === "DISASSEMBLE") {
    const isRework = sub === "disassemble" || tx === "DISASSEMBLE";
    const hasLinkedExecutionLogs = executedLogs?.some((entry) => !!entry.operation_line_id) ?? false;
    type QuantityGroup = { sum: number; unit: string | null; unitMixed: boolean; itemIds: Set<string> };
    const groups = new Map<string, QuantityGroup>();
    const add = (key: string, line: IoLine, delta: number, unit: string | null) => {
      const group = groups.get(key) ?? { sum: 0, unit: null, unitMixed: false, itemIds: new Set<string>() };
      group.sum += Math.abs(delta);
      const normalizedUnit = unit?.trim() ?? "";
      if (group.unit === null) group.unit = normalizedUnit;
      else if (group.unit !== normalizedUnit) group.unitMixed = true;
      group.itemIds.add(line.item_id);
      groups.set(key, group);
    };

    for (const b of batch.bundles) {
      const parent = getHistoryBomParentLine(b);
      for (const l of b.lines) {
        if (!l.included) continue;
        const executionLog = getHistoryLineExecutionLog(l, executedLogs);
        if (hasLinkedExecutionLogs && !executionLog) continue;
        const signed = getHistoryLineSignedQuantity(l, batch, b, executionLog);
        const delta = executionLog ? _toNum(executionLog.quantity_change) : Math.abs(_toNum(l.quantity)) * (signed.sign === "-" ? -1 : 1);
        const signKey = delta < 0 ? "negative" : delta > 0 ? "positive" : "neutral";
        const unit = executionLog?.item_unit ?? l.unit;
        if (parent && l === parent) {
          add(`parent:${signKey}`, l, delta, unit);
        } else if (b.source_kind === "bom_parent") {
          add(`child:${signKey}`, l, delta, unit);
        } else if (signed.sign) {
          add(`direct:${signed.sign === "-" ? "negative" : "positive"}`, l, delta, unit);
        }
      }
    }

    const append = (key: string, label: string, sign: "+" | "-", tone: MovementTone) => {
      const group = groups.get(key);
      if (!group || group.sum === 0) return;
      const unit = group.unit && !group.unitMixed ? ` ${group.unit}` : "";
      parts.push({ label: `${label} ${sign}${_formatNumber(group.sum)}${unit}`, tone });
    };
    append("parent:negative", isRework ? "재작업" : "생산", "-", "danger");
    append("parent:positive", isRework ? "재작업" : "생산", "+", "primary");
    append("child:negative", "부품", "-", "danger");
    append("child:positive", "부품", "+", "primary");
    append("direct:negative", "단품 출고", "-", "danger");
    append("direct:positive", "단품 입고", "+", "success");
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
    parts.push({ label: `격리 ${_distinctItemCount(included)}품목`, tone: "danger" });
  } else if (sub === "defect_restore" || tx === "UNMARK_DEFECTIVE") {
    parts.push({ label: `격리 해제 ${_distinctItemCount(included)}품목`, tone: "success" });
  } else if (sub === "defect_process" || tx === "DEFECT_SCRAP") {
    parts.push({ label: `폐기 ${_distinctItemCount(included)}품목`, tone: "danger" });
  } else if (sub === "warehouse_adjust_in") {
    parts.push(_verbItemPart("증가", "success", included));
  } else if (sub === "warehouse_adjust_out") {
    parts.push(_verbItemPart("감소", "danger", included));
  } else if (sub === "adjust_in") {
    parts.push(_verbItemPart("증가", "success", included));
  } else if (sub === "adjust_out") {
    parts.push(_verbItemPart("감소", "danger", included));
  } else if (tx === "ADJUST") {
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
    parts.push({ label: `세부 ${included.length}건`, tone: "muted" });
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

// 단건(낱개) 알약 verb — base 라벨은 glossary TRANSACTION_TYPE_LABEL.
// tone 만 history UI 컨텍스트에서 정의.
const _SINGLE_OP: Record<string, { verb: string; tone: MovementTone; signed?: boolean }> = {
  RECEIVE: { verb: "입고", tone: "success" },
  SHIP: { verb: _TX_LABEL.SHIP, tone: "danger" },
  ADJUST: { verb: "조정", tone: "warning", signed: true },
  TRANSFER_TO_PROD: { verb: "이동", tone: "info" },
  TRANSFER_TO_WH: { verb: "이동", tone: "info" },
  TRANSFER_DEPT: { verb: "이동", tone: "info" },
  BACKFLUSH: { verb: _TX_LABEL.BACKFLUSH, tone: "danger" },
  PRODUCE: { verb: _TX_LABEL.PRODUCE, tone: "success" },
  DISASSEMBLE: { verb: _TX_OPERATION.DISASSEMBLE, tone: "danger" },
  // 불량 처리 — 라벨은 목록·상세·수량 요약과 동일하게 유지한다.
  MARK_DEFECTIVE: { verb: _TX_OPERATION.MARK_DEFECTIVE, tone: "danger" },
  UNMARK_DEFECTIVE: { verb: _TX_OPERATION.UNMARK_DEFECTIVE, tone: "success" },
  DEFECT_SCRAP: { verb: _TX_OPERATION.DEFECT_SCRAP, tone: "danger" },
  SUPPLIER_RETURN: { verb: _TX_LABEL.SUPPLIER_RETURN, tone: "danger" },
  INTERNAL_USE: { verb: "반출", tone: "danger" },
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
