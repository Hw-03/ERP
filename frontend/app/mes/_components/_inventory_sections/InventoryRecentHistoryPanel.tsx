"use client";

import type { InventoryOperation, Item } from "@/lib/api";
import { useInventoryOperationsQuery } from "@/lib/queries/useInventoryOperationsQuery";
import { EmptyState, LoadFailureCard, LoadingSkeleton } from "../common";
import { formatHistoryDate } from "../_history_sections/historyFormat";
import { formatQty } from "@/lib/mes/format";

function getWorkContext(operation: InventoryOperation): string {
  const context = [operation.department, operation.actorName]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" · ");

  return context || operation.matchingLines[0]?.referenceNo || "업무 정보 없음";
}

function getOperationLabel(operation: InventoryOperation): string {
  if (operation.domain === "department_inventory" && operation.action === "correction") {
    return operation.kind === "CANCELLATION" ? "부서 입출고 취소" : "부서 입출고";
  }

  return operation.displayLabel;
}

export function InventoryRecentHistoryPanel({ item }: { item: Item }) {
  const { data, isLoading, isError, error, refetch } = useInventoryOperationsQuery({
    itemId: item.item_id,
    limit: 5,
  });
  const operations = data?.items ?? [];

  if (isLoading) return <LoadingSkeleton rows={3} />;

  if (isError) {
    return (
      <LoadFailureCard
        prefix="최근 입출고 내역을 불러오지 못했습니다"
        message={error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요."}
        retryLabel="다시 시도"
        onRetry={() => void refetch()}
      />
    );
  }

  if (operations.length === 0) {
    return <EmptyState compact title="최근 입출고 내역이 없습니다." />;
  }

  return (
    <ul className="inventory-recent">
      {operations.slice(0, 5).map((operation) => {
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
