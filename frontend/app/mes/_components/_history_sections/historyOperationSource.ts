import type { TransactionLog } from "@/lib/api/types/production";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { transactionColor } from "@/lib/mes-status";

type OperationSource = Pick<TransactionLog, "operation_domain" | "operation_action">;
type InitialStockSource = OperationSource & Partial<Pick<TransactionLog, "department" | "inventory_effect">> & { operation_kind?: string | null };

/** 초기 수량은 공급사 입고와 같은 거래 유형이어도 별도 업무로 표시한다. */
export function isInitialStockOperation(log: OperationSource): boolean {
  return log.operation_domain === "item" && log.operation_action === "initial_stock";
}

/** 초기 등록은 목적지마다 별도 로그를 만들며 해당 효과에 위치별 전후 수량을 보관한다. */
export function getInitialStockEffect(log: InitialStockSource): NonNullable<TransactionLog["inventory_effect"]>[number] | undefined {
  return isInitialStockOperation(log)
    ? log.inventory_effect?.find((cell) => (cell.scope === "warehouse" || cell.scope === "location") && Number(cell.delta) !== 0)
    : undefined;
}

/** 초기 등록은 외부에서 이동한 재고가 아니며 묶음의 모든 실제 목적지를 보여 준다. */
export function getInitialStockFlow(logs: readonly InitialStockSource[]): { label: string; from?: string; to?: string } | null {
  if (!logs.length || !logs.every(isInitialStockOperation)) return null;
  const destinations = [...new Set(logs.map((log) => {
    const cell = getInitialStockEffect(log);
    const department = cell?.scope === "warehouse" ? "창고" : cell?.department?.trim() || log.department?.trim();
    return department === "창고" ? "창고" : department ? `${department} 부서` : "위치 미기록";
  }))].join(" · ");
  return logs[0].operation_kind === "CANCELLATION"
    ? { label: `${destinations} 초기 등록 취소` }
    : { label: `초기 등록 → ${destinations}`, from: "초기 등록", to: destinations };
}

/** 초기 등록 사실은 사용자 입력과 분리된 작업 원장의 자동 기록이다. */
export function historySystemNote(log: OperationSource & Pick<TransactionLog, "operation_kind">): string | null {
  return isInitialStockOperation(log)
    ? log.operation_kind === "CANCELLATION" ? "초기 재고 등록 취소" : "초기 재고 등록"
    : null;
}

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
  if (isInitialStockOperation(log) && (notes?.trim() === "초기 재고 등록" || notes?.trim() === historySystemNote(log))) return null;
  return isStocktakeOperation(log) && notes?.trim() === log.operation_display_label?.trim() ? null : notes;
}
