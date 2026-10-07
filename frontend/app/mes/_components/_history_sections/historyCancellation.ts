import type { TransactionLog } from "@/lib/api";
import type { IoBatch } from "@/lib/api/types/io";
import type { HistorySelection } from "./historyConstants";
import type { LogGroup } from "./historyTableHelpers";
import type { TransactionDisplayGroup } from "@/lib/api/production";

/** 원본 flat 목록과 작업별 상세에 같은 갱신을 적용한다. */
export function updateHistoryDisplayGroupLogs(group: TransactionDisplayGroup, update: (logs: TransactionLog[]) => TransactionLog[]): TransactionDisplayGroup {
  return { ...group, logs: update(group.logs), workGroups: group.workGroups?.map((work) => updateHistoryDisplayGroupLogs(work, update)) };
}

function updateWorkGroupLogs(group: LogGroup, update: (logs: TransactionLog[]) => TransactionLog[]): LogGroup {
  if (group.type === "solo") return { ...group, log: update([group.log])[0] };
  if (group.type === "defect_lifecycle") {
    const [parent, child] = update([group.parent, group.child]);
    return { ...group, parent, child };
  }
  if (group.type === "submission") return { ...group, logs: update(group.logs), workGroups: group.workGroups.map((work) => updateWorkGroupLogs(work, update)) };
  return { ...group, logs: update(group.logs) };
}

export type HistoryCancelScope = "single" | "batch";

const REFERENCE_BATCH_CANCEL_PREFIX = "defect-disassemble:";

export function getHistoryReferenceGroupKey(log: TransactionLog): string | null {
  if (!log.reference_no) return null;
  return `${log.reference_no}::${log.shipping_phase ?? ""}`;
}

export function getHistoryBatchSelectionKey(log: TransactionLog): string | null {
  return log.operation_batch_id ?? getHistoryReferenceGroupKey(log);
}

export function isHistoryReferenceCancellationGroup(log: TransactionLog): boolean {
  return Boolean(log.reference_no?.startsWith(REFERENCE_BATCH_CANCEL_PREFIX));
}

export function getHistoryCancelScope(log: TransactionLog): HistoryCancelScope {
  return log.operation_id || log.operation_batch_id || isHistoryReferenceCancellationGroup(log)
    ? "batch"
    : "single";
}

export function getHistoryCancelCopy(scope: HistoryCancelScope): {
  trigger: string;
  description: string;
} {
  return scope === "batch"
    ? {
        trigger: "이 작업 묶음 전체 취소",
        description: "이 작업 묶음을 취소하고, 아래 재고 변동을 원래 상태로 되돌립니다.",
      }
    : {
        trigger: "이 이력 1건 취소",
        description: "이 내역을 취소하고, 아래 재고 변동을 원래 상태로 되돌립니다.",
      };
}

export type HistoryStateSnapshot = {
  logs: TransactionLog[];
  selection: HistorySelection | null;
  batchCache: Map<string, IoBatch>;
};

export type HistoryLoadReconcileState = {
  wasLoading: boolean;
  loadingLogs: TransactionLog[] | null;
};

/** 직접 변경 응답에 재계산 필드가 없으면 목록에서 받은 projection을 보존한다. */
export function mergeHistoryLogUpdate(
  log: TransactionLog,
  updated: TransactionLog,
): TransactionLog {
  if (log.log_id === updated.log_id) {
    return updated.request_order_stock == null
      ? { ...updated, request_order_stock: log.request_order_stock }
      : updated;
  }
  return {
    ...log,
    cancelled: true,
    cancel_reason: updated.cancel_reason,
    cancelled_by: updated.cancelled_by,
    cancelled_at: updated.cancelled_at,
    operation_effective_status: updated.operation_effective_status ?? log.operation_effective_status,
    reversal_operation_id: updated.reversal_operation_id ?? log.reversal_operation_id,
  };
}

type HistoryCancellationTarget =
  | { kind: "operation"; operationId: string }
  | { kind: "operation_batch"; batchId: string }
  | { kind: "reference"; referenceNo: string }
  | { kind: "log"; logId: string };

function getCancellationTarget(
  updated: TransactionLog,
  fallbackOperationBatchId: string | null,
): HistoryCancellationTarget {
  if (updated.operation_id) {
    return { kind: "operation", operationId: updated.operation_id };
  }
  const operationBatchId = updated.operation_batch_id ?? fallbackOperationBatchId;
  if (operationBatchId) {
    return { kind: "operation_batch", batchId: operationBatchId };
  }
  if (isHistoryReferenceCancellationGroup(updated) && updated.reference_no) {
    return { kind: "reference", referenceNo: updated.reference_no };
  }
  return { kind: "log", logId: updated.log_id };
}

function matchesCancellation(
  log: TransactionLog,
  target: HistoryCancellationTarget,
): boolean {
  if (target.kind === "operation") {
    return log.operation_id === target.operationId;
  }
  if (target.kind === "operation_batch") {
    return log.operation_batch_id === target.batchId;
  }
  if (target.kind === "reference") {
    return log.reference_no === target.referenceNo;
  }
  return log.log_id === target.logId;
}

export function applyHistoryCancellation(
  state: HistoryStateSnapshot,
  updated: TransactionLog,
  requestedBatchKey?: string | null,
): HistoryStateSnapshot {
  const fallbackOperationBatchId = requestedBatchKey && state.batchCache.has(requestedBatchKey)
    ? requestedBatchKey
    : null;
  const target = getCancellationTarget(updated, fallbackOperationBatchId);
  const patchLog = (log: TransactionLog) =>
    matchesCancellation(log, target)
      ? mergeHistoryLogUpdate(log, updated)
      : log;

  let selection = state.selection;
  if (selection?.kind === "submission") {
    selection = { ...selection, group: updateWorkGroupLogs(selection.group, (logs) => logs.map(patchLog)) as typeof selection.group };
  } else if (selection?.kind === "log" && matchesCancellation(selection.log, target)) {
    selection = { ...selection, log: patchLog(selection.log) };
  } else if (
    selection?.kind === "batch"
    && selection.logs.some((log) => matchesCancellation(log, target))
  ) {
    selection = {
      ...selection,
      logs: selection.logs.map(patchLog),
    };
  }

  let batchCache = state.batchCache;
  const cancelledBatchId = target.kind === "operation_batch" ? target.batchId : null;
  if (cancelledBatchId) {
    const cached = state.batchCache.get(cancelledBatchId);
    if (cached) {
      batchCache = new Map(state.batchCache);
      batchCache.set(cancelledBatchId, {
        ...cached,
        status: "cancelled",
        updated_at: updated.cancelled_at ?? cached.updated_at,
      });
    }
  }

  return {
    logs: state.logs.map(patchLog),
    selection,
    batchCache,
  };
}

export function reconcileHistorySelection(
  selection: HistorySelection | null,
  logs: TransactionLog[],
): HistorySelection | null {
  if (!selection) return null;
  if (selection.kind === "submission") {
    const fresh = new Map(logs.map((log) => [log.log_id, log]));
    if (!selection.group.logs.some((log) => fresh.has(log.log_id))) return null;
    return { ...selection, group: updateWorkGroupLogs(selection.group, (originals) => originals.map((log) => fresh.get(log.log_id) ?? log)) as typeof selection.group };
  }
  if (selection.kind === "log") {
    const fresh = logs.find((log) => log.log_id === selection.log.log_id);
    return fresh ? { ...selection, log: fresh } : null;
  }

  const lifecycleIds = selection.groupType === "defect_lifecycle" ? new Set(selection.logs.map((log) => log.log_id)) : null;
  const freshLogs = logs.filter((log) => lifecycleIds ? lifecycleIds.has(log.log_id)
    : selection.groupType === "operation" ? log.operation_id === selection.batchId
    : getHistoryBatchSelectionKey(log) === selection.batchId);
  // 모바일이 PC 기준으로 선택한 대표 품목을 조회 순서가 달라져도 유지한다.
  if (selection.groupType) freshLogs.sort((a, b) => Number(b.log_id === selection.logs[0]?.log_id) - Number(a.log_id === selection.logs[0]?.log_id));
  if (freshLogs.length === 1 && !selection.groupType) return { kind: "log", log: freshLogs[0] };
  return freshLogs.length > 0
    ? { ...selection, logs: freshLogs }
    : null;
}

export function advanceHistoryLoadReconcileState(
  state: HistoryLoadReconcileState,
  result: { loading: boolean; error?: unknown; logs: TransactionLog[] },
): { state: HistoryLoadReconcileState; shouldReconcile: boolean } {
  if (result.loading) {
    return {
      state: { wasLoading: true, loadingLogs: result.logs },
      shouldReconcile: false,
    };
  }
  if (result.error) {
    return {
      state: { wasLoading: false, loadingLogs: null },
      shouldReconcile: false,
    };
  }

  const shouldReconcile = state.wasLoading && state.loadingLogs !== result.logs;
  return {
    state: { wasLoading: false, loadingLogs: null },
    shouldReconcile,
  };
}
