import type { InventoryOperation, InventoryOperationLine } from "@/lib/api/types/production";
import { REQUEST_TYPE_LABEL, SUB_TYPE_LABEL, TRANSACTION_TYPE_LABEL } from "@/lib/io/glossary";
import { formatQty } from "@/lib/mes/format";
import type { HistoryDetailSummary } from "./historyDetailSummary";

const ACTION_LABELS: Record<string, string> = {
  production: "생산", disassembly: "분해·회수", correction: "부서 입출고",
  quantity_correction: "수량 보정", business_correction: "업무 정정", quarantine: "불량 격리",
  restore: "불량 해제", rework_defective: "불량 재작업", category_transfer: "재고 분류 변경",
  component_change: "품목 전환", prepare: "출하 준비", pickup: "출하 픽업",
  cutover: "공동재고 전환", inventory_integrity_repair: "재고 기록 복구",
};
const STATUS_LABELS: Record<string, string> = {
  PENDING: "대기", SUBMITTED: "제출", APPROVED: "승인", PREPARING: "준비 중", PREPARED: "준비 완료",
  COMPLETED: "완료", CANCELLED: "취소", REJECTED: "반려", RESERVED: "예약", CONSUMED: "사용 완료",
  RELEASED: "해제", DRAFT: "작성 중", CONFIRMED: "확인 완료", RECEIVED: "인수 완료", PICKED_UP: "픽업 완료", FAILED_APPROVAL: "승인 처리 실패",
};
export const OPERATION_SOURCE_LABELS: Record<string, string> = {
  InventoryOperation: "재고 작업", IoBatch: "입출고 작업", ShippingRequest: "출하 요청",
  ShippingAllocation: "출하 배정", StockRequest: "입출고 요청", HandoverDoc: "인수인계",
};

/** 기존 한글 업무명은 보존하고 내부 식별자는 입출고 화면의 사전으로 번역한다. */
export function inventoryOperationLabel(operation: InventoryOperation): string {
  const stored = operation.displayLabel?.trim() ?? "";
  const base = stored.replace(/ 취소$/, "");
  const labels: Record<string, string> = { ...TRANSACTION_TYPE_LABEL, ...REQUEST_TYPE_LABEL, ...SUB_TYPE_LABEL, ...ACTION_LABELS };
  const label = /[가-힣]/.test(base) ? base : labels[operation.action] ?? labels[base]
    ?? (operation.domain === "production" ? "생산" : operation.domain === "stocktake" ? "재고 전수조사" : "재고 작업");
  return operation.kind === "CANCELLATION" || operation.effectiveStatus === "cancellation" ? `${label} 취소` : label;
}

/** 소문자·대문자 상태를 동일하게 처리하고 미지원 내부값은 노출하지 않는다. */
export function inventoryOperationStatusLabel(status: string): string {
  return STATUS_LABELS[status.trim().toUpperCase()] ?? "상태 확인 필요";
}

type LineMeaning = { group: string; verb: string };

/** 작업 종류와 원장 역할로 분류한다. 취소의 반대 부호를 새로운 생산으로 해석하지 않는다. */
export function inventoryOperationLineMeaning(operation: InventoryOperation, line: InventoryOperationLine): LineMeaning {
  const reversed = operation.kind === "CANCELLATION" || operation.effectiveStatus === "cancellation";
  const role = line.operationRole ?? line.historyLog?.operation_role;
  const type = line.transactionType;
  const disassembly = ["disassemble", "disassembly"].includes(operation.action) || type === "DISASSEMBLE";
  if (operation.action === "component_change") {
    const source = role === "COMPONENT_INPUT" || type === "BACKFLUSH";
    return { group: source ? "전환 전 품목" : "전환 후 품목", verb: reversed ? "전환 취소" : "전환" };
  }
  if (role?.startsWith("REWORK_PARENT")) return { group: "재작업한 품목", verb: reversed ? "반환" : "재작업" };
  if (role === "REWORK_CHILD_SCRAP") return { group: "폐기한 자재", verb: reversed ? "폐기 취소" : "폐기" };
  if (role === "REWORK_CHILD_DEFECTIVE") return { group: "불량으로 회수한 자재", verb: reversed ? "회수 취소" : "불량 회수" };
  if (role === "REWORK_CHILD_NORMAL") return { group: "정상으로 회수한 자재", verb: reversed ? "회수 취소" : "회수" };
  if (disassembly && (role === "PRODUCT_OUTPUT" || type === "PRODUCE" || type === "RECEIVE")) return { group: reversed ? "회수를 취소한 자재" : "회수한 자재", verb: reversed ? "회수 취소" : "회수" };
  if (disassembly && ["BACKFLUSH", "DISASSEMBLE", "SHIP"].includes(type)) return { group: reversed ? "분해 취소 품목" : "분해한 품목", verb: reversed ? "반환" : "분해" };
  // 입출고 V2의 부서 입고·출고도 PRODUCE/BACKFLUSH를 사용하므로 작업 의도를 우선한다.
  if (["receive_supplier", "tube_receive_supplier", "raw_receive"].includes(operation.action)) return { group: reversed ? "입고 취소 품목" : "입고된 품목", verb: reversed ? "입고 취소" : "입고" };
  if (["outbound_supplier", "tube_outbound_supplier", "raw_ship", "adjust_out"].includes(operation.action)) return { group: reversed ? "출고 취소 품목" : "출고된 품목", verb: reversed ? "출고 취소" : "출고" };
  if (role === "COMPONENT_INPUT" || type === "BACKFLUSH") return { group: reversed ? "반환된 자재" : "사용한 자재", verb: reversed ? "반환" : "사용" };
  if (role === "PRODUCT_OUTPUT" || type === "PRODUCE") return { group: reversed ? "생산 취소 품목" : "생산된 품목", verb: reversed ? "생산 취소" : "생산" };
  if (role === "TRANSFER" || type?.startsWith("TRANSFER_")) return { group: "이동한 품목", verb: reversed ? "이동 취소" : "이동" };
  const meanings: Partial<Record<InventoryOperationLine["transactionType"], LineMeaning>> = {
    RECEIVE: { group: "입고된 품목", verb: "입고" }, SHIP: { group: "출고된 품목", verb: "출고" },
    MATERIAL_OUT: { group: "출고된 품목", verb: "출고" }, INTERNAL_USE: { group: "사용 출고한 품목", verb: "사용 출고" },
    ADJUST: { group: "수량을 보정한 품목", verb: "보정" }, MARK_DEFECTIVE: { group: "불량으로 격리한 품목", verb: "불량 격리" },
    UNMARK_DEFECTIVE: { group: "정상으로 복귀한 품목", verb: "정상 복귀" }, DEFECT_SCRAP: { group: "폐기한 품목", verb: "폐기" },
    SUPPLIER_RETURN: { group: "반품한 품목", verb: "반품" },
  };
  const meaning = meanings[type] ?? { group: "재고가 바뀐 품목", verb: "변동" };
  return reversed ? { group: `${meaning.group} · 취소`, verb: `${meaning.verb} 취소` } : meaning;
}

/** 위치 이동은 합계 증감 대신 실제 이동 수량을 사용하며 서로 다른 단위를 합산하지 않는다. */
export function inventoryOperationQuantityLabel(operation: InventoryOperation, line: InventoryOperationLine): string {
  const meaning = inventoryOperationLineMeaning(operation, line);
  const qty = line.transferQty == null ? Math.abs(line.quantityChange) : Math.abs(line.transferQty);
  const rawUnit = line.historyLog?.item_unit?.trim();
  const unit = rawUnit?.toUpperCase() === "EA" ? "개" : rawUnit;
  return `${formatQty(qty)}${unit === "개" ? unit : unit ? ` ${unit}` : ""} ${meaning.verb}`;
}

/** 입출고 내역의 요약 카드를 사용하되 재고는 각 품목의 실제 기록에서 별도로 표시한다. */
export function inventoryOperationHeader(operation: InventoryOperation): HistoryDetailSummary {
  const cancellation = operation.kind === "CANCELLATION" || operation.effectiveStatus === "cancellation";
  return {
    target: { itemId: "", itemName: "", mesCode: null }, operationLabel: inventoryOperationLabel(operation),
    status: operation.effectiveStatus === "cancelled" ? { label: "취소된 작업", tone: "danger", reason: null }
      : cancellation ? { label: "취소 기록", tone: "muted", reason: null } : { label: "완료", tone: "success", reason: null },
    requester: { label: cancellation ? "취소자" : "담당자", name: operation.actorName, at: operation.effectiveAt },
    impactGroups: [], impactIdentity: operation.operationId, conversion: null, actualStock: null, composition: null, flow: null,
  };
}
