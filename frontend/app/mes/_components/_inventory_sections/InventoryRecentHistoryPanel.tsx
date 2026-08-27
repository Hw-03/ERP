"use client";

import type { InventoryOperation, Item, TransactionLog } from "@/lib/api";
import { useInventoryOperationsQuery } from "@/lib/queries/useInventoryOperationsQuery";
import { useTransactionsQuery } from "@/lib/queries/useTransactionsQuery";
import { EmptyState, LoadFailureCard, LoadingSkeleton } from "../common";
import { formatHistoryDate } from "../_history_sections/historyFormat";
import { getHistoryListOperationLabel } from "../_history_sections/historyPresentation";
import { getHistoryLogSignedQuantity } from "../_history_sections/historyTableHelpers";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";

function getWorkContext(operation: InventoryOperation): string {
  const context = [operation.department, operation.actorName]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" · ");

  return context || operation.matchingLines[0]?.referenceNo || "업무 정보 없음";
}

function getOperationLabel(operation: InventoryOperation): string {
  if (operation.domain === "inventory_io" && ["adjust_in", "adjust_out"].includes(operation.action)) {
    return operation.kind === "CANCELLATION" ? "부서 입출고 취소" : "부서 입출고";
  }

  if (operation.domain === "department_inventory" && operation.action === "correction") {
    return operation.kind === "CANCELLATION" ? "부서 입출고 취소" : "부서 입출고";
  }

  return operation.displayLabel;
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
        const quantityValue = line.transferQty == null
          ? line.quantityChange
          : Math.sign(line.quantityChange) * Math.abs(line.transferQty);
        const sign = quantityValue > 0 ? "+" : quantityValue < 0 ? "-" : "";
        const quantity = `${sign}${formatQty(Math.abs(quantityValue))} ${item.unit}`;
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
        const quantity = getHistoryLogSignedQuantity(log).parts.map((part) => part.label).join(" ");
        return (
          <li key={log.log_id}>
            <div className="inventory-recent-main">
              <span>{getHistoryListOperationLabel(log)}</span>
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
