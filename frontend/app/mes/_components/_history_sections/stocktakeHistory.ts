import type { StocktakeHistoryWork, TransactionDisplayGroup } from "@/lib/api/production";
import type { InventoryObservationLine, TransactionLog } from "@/lib/api/types/production";

export const OBSERVATION_LABELS = { normal: "정상", defect: "불량", b_grade: "B급", obsolete: "구형" } as const;

/** Preserve missing evidence and keep category transfers separate from net quantity changes. */
export function observationChanges(line: InventoryObservationLine): Array<{ category: keyof typeof OBSERVATION_LABELS; before: number; after: number; delta: number }> | null {
  if (!line.beforeQuantities || !line.afterQuantities) return null;
  return (Object.keys(OBSERVATION_LABELS) as (keyof typeof OBSERVATION_LABELS)[])
    .filter(category => line.beforeQuantities[category] !== line.afterQuantities[category])
    .map(category => ({ category, before: line.beforeQuantities[category], after: line.afterQuantities[category], delta: line.afterQuantities[category] - line.beforeQuantities[category] }));
}

/** Read sealed categories independently; cancelling deltas must not hide a classification change. */
export function observationSummary(line: InventoryObservationLine): string {
  const changes = observationChanges(line);
  if (!changes) return "당시 수량 기록 없음";
  return changes.length ? changes.map(({ category, before, after }) => `${OBSERVATION_LABELS[category]} ${before.toLocaleString()} → ${after.toLocaleString()}`).join(" · ") : "변동 없음";
}

/** Reuse selection plumbing with explicit read-only view rows, never persist them as transactions. */
export function stocktakeHistoryRows(work: StocktakeHistoryWork): TransactionLog[] {
  return work.observations.map(line => ({
    log_id: `observation:${work.operationId}:${line.countId}`, item_id: line.itemId,
    item_name: line.itemName ?? "품목", mes_code: line.mesCode, item_process_type_code: null,
    item_unit: line.unit, transaction_type: "ADJUST", quantity_change: 0, quantity_before: null, quantity_after: null,
    warehouse_qty_before: null, warehouse_qty_after: null, transfer_qty: null, reference_no: null,
    produced_by: work.actorName, requester_name: work.actorName, approver_name: null,
    department: work.department, notes: null, operation_batch_id: null, operation_id: work.operationId,
    operation_kind: "BUSINESS", operation_domain: "stocktake", operation_action: "apply",
    operation_display_label: "재고 전수조사", created_at: work.createdAt,
    cancelled: false, cancel_reason: null, cancelled_by: null, cancelled_at: null,
    stocktake_history: { work, line, selection: "item" },
  }));
}

export function historyDisplayLogs(groups: TransactionDisplayGroup[]): TransactionLog[] {
  return groups.flatMap(group => group.stocktake ? stocktakeHistoryRows(group.stocktake) : group.logs);
}

export function stocktakeWorkSelection(log: TransactionLog): TransactionLog {
  const data = log.stocktake_history!;
  return { ...log, item_name: `${data.line.itemName ?? "품목"}${data.work.itemCount > 1 ? ` 외 ${data.work.itemCount - 1}품목` : ""}`,
    stocktake_history: { ...data, selection: "work" } };
}
