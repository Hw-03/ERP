"use client";

import type { Item, TransactionLog } from "@/lib/api";
import { useTransactionsQuery } from "@/lib/queries/useTransactionsQuery";
import { EmptyState, LoadFailureCard, LoadingSkeleton } from "../common";
import { formatHistoryDate } from "../_history_sections/historyFormat";
import { getHistoryListOperationLabel } from "../_history_sections/historyPresentation";
import { getHistoryLogSignedQuantity } from "../_history_sections/historyTableHelpers";
import { LEGACY_COLORS } from "@/lib/mes/color";

function getWorkContext(log: TransactionLog): string {
  const context = [log.department, log.requester_name ?? log.produced_by]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" · ");

  return context || log.reference_no || "업무 정보 없음";
}

export function InventoryRecentHistoryPanel({ item }: { item: Item }) {
  const { data: logs = [], isLoading, isError, error, refetch } = useTransactionsQuery({
    itemId: item.item_id,
    limit: 5,
  });

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

  if (logs.length === 0) {
    return <EmptyState compact title="최근 입출고 내역이 없습니다." />;
  }

  return (
    <ul className="flex flex-col divide-y" style={{ borderColor: LEGACY_COLORS.border }}>
      {logs.slice(0, 5).map((log) => {
        const quantity = getHistoryLogSignedQuantity(log).parts.map((part) => part.label).join(" ");
        return (
          <li key={log.log_id} className="py-3 first:pt-2">
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0 text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>
                {getHistoryListOperationLabel(log)}
              </span>
              <span className="shrink-0 text-sm font-black" style={{ color: LEGACY_COLORS.text }}>
                {quantity}
              </span>
            </div>
            <div className="mt-1 flex min-w-0 items-center justify-between gap-3 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              <span className="min-w-0 truncate">{getWorkContext(log)}</span>
              <time className="shrink-0" dateTime={log.requested_at ?? log.created_at}>
                {formatHistoryDate(log.requested_at ?? log.created_at)}
              </time>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
