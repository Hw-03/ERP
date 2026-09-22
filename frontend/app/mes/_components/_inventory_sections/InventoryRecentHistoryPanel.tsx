"use client";

import type { ReactNode } from "react";
import type { InventoryOperation, Item, TransactionLog, TransactionType } from "@/lib/api";
import type { InventoryOperationLine } from "@/lib/api/types/production";
import type { IoBatch } from "@/lib/api/types/io";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { transactionColor } from "@/lib/mes-status";
import { useInventoryOperationsQuery } from "@/lib/queries/useInventoryOperationsQuery";
import { useTransactionsQuery } from "@/lib/queries/useTransactionsQuery";
import { EmptyState, LoadFailureCard, LoadingSkeleton } from "../common";
import { formatHistoryDate } from "../_history_sections/historyFormat";
import { getHistoryListOperationLabel } from "../_history_sections/historyPresentation";
import { FlowBadge, StockSnapshotContent } from "../_history_sections/historyTableHelpers";
import { isReworkOperation } from "../_history_sections/transactionTaxonomy";

function appendCancellation(label: string, isCancellation: boolean): string {
  return isCancellation && !label.endsWith(" 취소") ? `${label} 취소` : label;
}

function getFallbackOperationLabel(operation: InventoryOperation): string {
  const displayLabel = operation.displayLabel.trim();
  const isInternalCode = !displayLabel || displayLabel === operation.action || /^[a-z0-9_:-]+$/i.test(displayLabel);
  return appendCancellation(isInternalCode ? "기타 작업" : displayLabel, operation.kind === "CANCELLATION");
}

function getWorkContext(operation: InventoryOperation, line: InventoryOperationLine): string {
  const context = [operation.department, operation.actorName]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" · ");
  return context || line.referenceNo || "업무 정보 없음";
}

function getHistoryLabel(log: TransactionLog): string {
  const batch = log.history_batch;
  if (!batch) return normalizeHistoryLabel(getHistoryListOperationLabel(log));
  // 목록 라벨 계산에는 이 세 필드와 빈 bundles 만 필요하다. 재고·수량을 만들지 않는다.
  const labelBatch = { ...batch, bundles: [] } as unknown as IoBatch;
  return normalizeHistoryLabel(getHistoryListOperationLabel(log, labelBatch));
}

function normalizeHistoryLabel(label: string): string {
  const cancellationSuffix = label.endsWith(" 취소") ? " 취소" : "";
  const base = cancellationSuffix ? label.slice(0, -cancellationSuffix.length) : label;
  return /^[a-z0-9_:-]+$/i.test(base) ? `기타 작업${cancellationSuffix}` : label;
}

function RecentLine({
  type,
  label,
  log,
  context,
  effectiveAt,
  cancelled,
}: {
  type: TransactionType;
  label: string;
  log: TransactionLog | null;
  context: string;
  effectiveAt: string;
  cancelled: boolean;
}) {
  const color = log && isReworkOperation(log) ? LEGACY_COLORS.red : transactionColor(type);
  return (
    <li data-cancelled={cancelled || undefined}>
      <div className="inventory-recent-main">
        <FlowBadge type={type} label={label} color={color} variant="panel" />
        <StockSnapshotContent log={log} emptyLogLabel="기록 없음" />
      </div>
      <div className="inventory-recent-meta">
        <span>{context}</span>
        <time dateTime={effectiveAt}>{formatHistoryDate(effectiveAt)}</time>
      </div>
    </li>
  );
}

function OperationRows({ operations }: { operations: InventoryOperation[] }) {
  return (
    <ul className="inventory-recent">
      {operations.flatMap((operation) => operation.matchingLines.map((line) => {
        const log = line.historyLog ?? null;
        return (
          <RecentLine
            key={`${operation.operationId}-${line.logId}`}
            type={log?.transaction_type ?? line.transactionType}
            label={log ? getHistoryLabel(log) : getFallbackOperationLabel(operation)}
            log={log}
            context={getWorkContext(operation, line)}
            effectiveAt={operation.effectiveAt}
            cancelled={operation.effectiveStatus === "cancelled" || Boolean(log?.cancelled)}
          />
        );
      }))}
    </ul>
  );
}

function LegacyRows({ logs }: { logs: TransactionLog[] }) {
  return (
    <ul className="inventory-recent">
      {logs.map((log) => (
        <RecentLine
          key={log.log_id}
          type={log.transaction_type}
          label={getHistoryLabel(log)}
          log={log}
          context={[log.department, log.requester_name ?? log.produced_by]
            .filter((value): value is string => Boolean(value?.trim()))
            .join(" · ") || log.reference_no || "업무 정보 없음"}
          effectiveAt={log.requested_at ?? log.created_at}
          cancelled={log.cancelled}
        />
      ))}
    </ul>
  );
}

export function InventoryRecentHistoryPanel({ item }: { item: Item }) {
  const operationQuery = useInventoryOperationsQuery({ itemId: item.item_id, limit: 5 });
  const legacyQuery = useTransactionsQuery({ itemId: item.item_id, unlinkedOnly: true, limit: 5 });
  const operations = operationQuery.data?.items ?? [];
  const legacyLogs = (legacyQuery.data ?? []).filter((log) => !log.operation_id).slice(0, 5);
  const isLoading = operationQuery.isLoading || legacyQuery.isLoading;
  const isError = operationQuery.isError || legacyQuery.isError;
  const error = operationQuery.error ?? legacyQuery.error;

  let content: ReactNode;
  if (isLoading) {
    content = <LoadingSkeleton rows={3} />;
  } else if (isError) {
    content = <LoadFailureCard prefix="최근 입출고 내역을 불러오지 못했습니다" message={error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요."} retryLabel="다시 시도" onRetry={() => void Promise.all([operationQuery.refetch(), legacyQuery.refetch()])} />;
  } else if (operations.length === 0 && legacyLogs.length === 0) {
    content = <EmptyState compact illustrated className="inventory-recent-empty" title="최근 입출고 내역이 없습니다." description="" />;
  } else {
    content = (
      <div className="inventory-recent-groups">
        {operations.length > 0 && <OperationRows operations={operations.slice(0, 5)} />}
        {operations.length > 0 && legacyLogs.length > 0 && <hr className="inventory-recent-divider" />}
        {legacyLogs.length > 0 && <LegacyRows logs={legacyLogs} />}
      </div>
    );
  }
  return <div className="inventory-recent-panel">{content}</div>;
}
