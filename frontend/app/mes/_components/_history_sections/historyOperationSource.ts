import type { TransactionLog } from "@/lib/api/types/production";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { transactionColor } from "@/lib/mes-status";

type OperationSource = Pick<TransactionLog, "operation_domain" | "operation_action">;

/** 작업 원장의 출처로 판별하며 사용자 메모는 분류에 사용하지 않는다. */
export function isStocktakeOperation(log: OperationSource): boolean {
  return log.operation_domain === "stocktake" && log.operation_action === "apply";
}

/** PC·모바일·상세에 같은 조사 색상을 적용한다. */
export function historyOperationColor(log: TransactionLog, displayType = log.transaction_type): string {
  return isStocktakeOperation(log) ? LEGACY_COLORS.green : transactionColor(displayType);
}

/** 자동 생성된 작업명만 표시에서 생략하고 저장된 메모와 사용자 문구를 보존한다. */
export function historyUserNotes(log: TransactionLog, notes = log.notes): string | null {
  return isStocktakeOperation(log) && notes?.trim() === log.operation_display_label?.trim() ? null : notes;
}
