"use client";

import type { InventoryOperation, Item, TransactionLog } from "@/lib/api";
import { useInventoryOperationsQuery } from "@/lib/queries/useInventoryOperationsQuery";
import { useTransactionsQuery } from "@/lib/queries/useTransactionsQuery";
import { EmptyState, LoadFailureCard, LoadingSkeleton } from "../common";
import { formatHistoryDate } from "../_history_sections/historyFormat";
import { formatQty } from "@/lib/mes/format";
import { SUB_TYPE_LABEL, TRANSACTION_TYPE_LABEL } from "@/lib/io/glossary";

type RecentLine = {
  transactionType: TransactionLog["transaction_type"];
  quantityChange: number;
  transferQty?: number | null;
  notes?: string | null;
};

const LEGACY_NOTE_QUANTITY_PATTERN = /\/\s*(-?\d+(?:\.\d+)?)개\s*(?:\/|$)/;

function appendCancellation(label: string, isCancellation: boolean): string {
  return isCancellation && !label.endsWith(" 취소") ? `${label} 취소` : label;
}

function getTransferLabel(transactionType: RecentLine["transactionType"]): string | null {
  if (transactionType === "TRANSFER_TO_PROD") return "창고 → 부서 이동";
  if (transactionType === "TRANSFER_TO_WH") return "부서 → 창고 이동";
  if (transactionType === "TRANSFER_DEPT") return "부서 이동";
  return null;
}

function getLegacyOperationLabel(log: TransactionLog): string {
  const label = getTransferLabel(log.transaction_type)
    ?? TRANSACTION_TYPE_LABEL[log.transaction_type];
  return appendCancellation(label, log.operation_kind === "CANCELLATION");
}

function getOperationLabel(operation: InventoryOperation): string {
  const ioLabel = SUB_TYPE_LABEL[operation.action as keyof typeof SUB_TYPE_LABEL];
  const label = operation.domain === "inventory_io" && operation.action === "dept_transfer"
    ? "부서 이동"
    : operation.domain === "inventory_io" && ioLabel
      ? ioLabel
      : operation.domain === "department_inventory" && operation.action === "correction"
        ? "수량 보정"
        : operation.displayLabel;
  return appendCancellation(label, operation.kind === "CANCELLATION");
}

function getLegacyNoteQuantity(notes: string | null | undefined): number | null {
  const match = notes?.match(LEGACY_NOTE_QUANTITY_PATTERN);
  const quantity = match?.[1] == null ? NaN : Number(match[1]);
  return Number.isFinite(quantity) && quantity !== 0 ? Math.abs(quantity) : null;
}

function formatProcessedQuantity(line: RecentLine, unit: string): string {
  const transferQty = Number(line.transferQty);
  const quantityChange = Number(line.quantityChange);
  const quantity = Number.isFinite(transferQty) && transferQty !== 0
    ? Math.abs(transferQty)
    : Number.isFinite(quantityChange) && quantityChange !== 0
      ? Math.abs(quantityChange)
      : getLegacyNoteQuantity(line.notes);
  return quantity == null ? "수량 미기록" : `${formatQty(quantity)} ${unit}`;
}

function getWorkContext(operation: InventoryOperation): string {
  const context = [operation.department, operation.actorName]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" · ");

  return context || operation.matchingLines[0]?.referenceNo || "업무 정보 없음";
}

function getLegacyWorkContext(log: TransactionLog): string {
  const context = [log.department, log.requester_name ?? log.produced_by]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" · ");

  return context || log.reference_no || "업무 정보 없음";
}

function OperationRows({ item, operations }: { item: Item; operations: InventoryOperation[] }) {
  return (
    <ul className="inventory-recent">
      {operations.map((operation) => {
        const line = operation.matchingLines[0];
        if (!line) return null;
        const cancelledOriginal = operation.effectiveStatus === "cancelled";
        const quantity = formatProcessedQuantity(line, item.unit);
        return (
          <li key={operation.operationId} data-cancelled={cancelledOriginal || undefined}>
            <div className="inventory-recent-main">
              <span>{getOperationLabel(operation)}</span>
              <b>{quantity}</b>
            </div>
            <div className="inventory-recent-meta">
              <span>{getWorkContext(operation)}</span>
              <time dateTime={operation.effectiveAt}>
                {formatHistoryDate(operation.effectiveAt)}
              </time>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function LegacyRows({ logs }: { logs: TransactionLog[] }) {
  return (
    <ul className="inventory-recent">
      {logs.map((log) => {
        const quantity = formatProcessedQuantity({
          transactionType: log.transaction_type,
          quantityChange: log.quantity_change,
          transferQty: log.transfer_qty,
          notes: log.notes,
        }, log.item_unit);
        return (
          <li key={log.log_id}>
            <div className="inventory-recent-main">
              <span>{getLegacyOperationLabel(log)}</span>
              <b>{quantity}</b>
            </div>
            <div className="inventory-recent-meta">
              <span>{getLegacyWorkContext(log)}</span>
              <time dateTime={log.requested_at ?? log.created_at}>
                {formatHistoryDate(log.requested_at ?? log.created_at)}
              </time>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function InventoryRecentHistoryPanel({ item }: { item: Item }) {
  const operationQuery = useInventoryOperationsQuery({
    itemId: item.item_id,
    limit: 5,
  });
  const legacyQuery = useTransactionsQuery({
    itemId: item.item_id,
    unlinkedOnly: true,
    limit: 5,
  });
  const operations = operationQuery.data?.items ?? [];
  const legacyLogs = (legacyQuery.data ?? []).filter((log) => !log.operation_id).slice(0, 5);
  const isLoading = operationQuery.isLoading || legacyQuery.isLoading;
  const isError = operationQuery.isError || legacyQuery.isError;
  const error = operationQuery.error ?? legacyQuery.error;

  if (isLoading) return <LoadingSkeleton rows={3} />;

  if (isError) {
    return (
      <LoadFailureCard
        prefix="최근 입출고 내역을 불러오지 못했습니다"
        message={error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요."}
        retryLabel="다시 시도"
        onRetry={() => void Promise.all([operationQuery.refetch(), legacyQuery.refetch()])}
      />
    );
  }

  if (operations.length === 0 && legacyLogs.length === 0) {
    return <EmptyState compact title="최근 입출고 내역이 없습니다." />;
  }

  return (
    <div className="inventory-recent-groups">
      {operations.length > 0 && <OperationRows item={item} operations={operations.slice(0, 5)} />}
      {/* 새 원장 이력과 원장에 연결되지 않은 기존 이력의 경계. */}
      {operations.length > 0 && legacyLogs.length > 0 && <hr className="inventory-recent-divider" />}
      {legacyLogs.length > 0 && <LegacyRows logs={legacyLogs} />}
    </div>
  );
}
