import type { TransactionLog } from "@/lib/api";
import type { IoBatch } from "@/lib/api/types/io";
import type { HistorySelection } from "./historyConstants";

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
  return log.operation_batch_id || isHistoryReferenceCancellationGroup(log)
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
        description: "같은 작업 묶음에 포함된 모든 실제 재고 영향을 함께 되돌립니다.",
      }
    : {
        trigger: "이 이력 1건 취소",
        description: "선택한 이력 1건의 실제 재고 영향만 되돌립니다.",
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

function withCancellation(
  log: TransactionLog,
  updated: TransactionLog,
): TransactionLog {
  if (log.log_id === updated.log_id) return updated;
  return {
    ...log,
    cancelled: true,
    cancel_reason: updated.cancel_reason,
    cancelled_by: updated.cancelled_by,
    cancelled_at: updated.cancelled_at,
  };
}

type HistoryCancellationTarget =
  | { kind: "operation_batch"; batchId: string }
  | { kind: "reference"; referenceNo: string }
  | { kind: "log"; logId: string };

function getCancellationTarget(
  updated: TransactionLog,
  fallbackOperationBatchId: string | null,
): HistoryCancellationTarget {
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
      ? withCancellation(log, updated)
      : log;

  let selection = state.selection;
  if (selection?.kind === "log" && matchesCancellation(selection.log, target)) {
    selection = { kind: "log", log: patchLog(selection.log) };
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
  if (target.kind === "operation_batch") {
    const cached = state.batchCache.get(target.batchId);
    if (cached) {
      batchCache = new Map(state.batchCache);
      batchCache.set(target.batchId, {
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
  if (selection.kind === "log") {
    const fresh = logs.find((log) => log.log_id === selection.log.log_id);
    return fresh ? { kind: "log", log: fresh } : null;
  }

  const freshLogs = logs.filter((log) => getHistoryBatchSelectionKey(log) === selection.batchId);
  if (freshLogs.length === 1) return { kind: "log", log: freshLogs[0] };
  return freshLogs.length > 0
    ? { kind: "batch", batchId: selection.batchId, logs: freshLogs }
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
