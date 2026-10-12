"use client";

import { useMemo, type ReactNode } from "react";
import type { Item, TransactionLog, TransactionType } from "@/lib/api";
import type { TransactionDisplayGroupPage } from "@/lib/api/production";
import type { IoBatch } from "@/lib/api/types/io";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { transactionColor } from "@/lib/mes-status";
import { useItemHistoryPagesQuery } from "@/lib/queries/useItemHistoryPagesQuery";
import { Button } from "@/lib/ui/Button";
import { EmptyState, LoadFailureCard, LoadingSkeleton } from "../common";
import { formatHistoryDate, parseUtc } from "../_history_sections/historyFormat";
import { getHistoryListOperationLabel } from "../_history_sections/historyPresentation";
import { FlowBadge, StockSnapshotContent } from "../_history_sections/historyTableHelpers";
import { isReworkOperation } from "../_history_sections/transactionTaxonomy";
import mobileStyles from "./InventoryRecentHistoryPanel.module.css";

/** 작업의 모든 거래를 보존하고 화면에는 중복 없이 입출고 내역과 같은 날짜순으로 표시한다. */
function getRecentLogs(pages: TransactionDisplayGroupPage[]): TransactionLog[] {
  const logs = new Map<string, TransactionLog>();
  for (const page of pages) {
    for (const group of page.groups) {
      for (const log of group.logs) logs.set(log.log_id, log);
    }
  }
  return [...logs.values()].sort((left, right) =>
    parseUtc(right.requested_at ?? right.created_at).getTime() - parseUtc(left.requested_at ?? left.created_at).getTime()
    || parseUtc(right.created_at).getTime() - parseUtc(left.created_at).getTime()
    || right.log_id.localeCompare(left.log_id),
  );
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
  mobilePresentation = false,
}: {
  type: TransactionType;
  label: string;
  log: TransactionLog | null;
  context: string;
  effectiveAt: string;
  cancelled: boolean;
  mobilePresentation?: boolean;
}): ReactNode {
  const color = log && isReworkOperation(log) ? LEGACY_COLORS.red : transactionColor(type);
  return (
    <li data-cancelled={cancelled || undefined}>
      <div className="inventory-recent-main">
        <FlowBadge type={type} label={label} color={color} variant="panel" />
        <time dateTime={effectiveAt}>{formatHistoryDate(effectiveAt)}</time>
      </div>
      <div className="inventory-recent-body">
        <div className="inventory-recent-meta">
          <span>{context}</span>
          {cancelled && <span className="inventory-recent-cancelled">취소된 작업</span>}
        </div>
        <StockSnapshotContent log={log} emptyLogLabel="기록 없음" variant="panel" expandableUnavailableReason={mobilePresentation} />
      </div>
    </li>
  );
}

function HistoryRows({ logs, mobilePresentation }: { logs: TransactionLog[]; mobilePresentation: boolean }): ReactNode {
  return (
    <ul className="inventory-recent">
      {logs.map((log) => (
        <RecentLine
          key={log.log_id}
          mobilePresentation={mobilePresentation}
          type={log.transaction_type}
          label={getHistoryLabel(log)}
          log={log}
          context={[log.department, log.executor_name ?? log.requester_name ?? log.produced_by]
            .filter((value): value is string => Boolean(value?.trim()))
            .join(" · ") || log.reference_no || "업무 정보 없음"}
          effectiveAt={log.requested_at ?? log.created_at}
          cancelled={log.cancelled || log.operation_effective_status === "cancelled"}
        />
      ))}
    </ul>
  );
}

export function InventoryRecentHistoryPanel({ item, mobilePresentation = false }: { item: Item; mobilePresentation?: boolean }): ReactNode {
  const query = useItemHistoryPagesQuery(item.item_id);
  const logs = useMemo(() => getRecentLogs(query.data?.pages ?? []), [query.data]);
  const errorMessage = query.error?.message || "잠시 후 다시 시도해 주세요.";
  const loadMore = (): void => {
    if (query.hasNextPage && !query.isFetching) void query.fetchNextPage({ cancelRefetch: false });
  };

  let content: ReactNode;
  if (query.isPending) {
    content = <LoadingSkeleton rows={3} />;
  } else if (query.isError && !query.data) {
    content = <LoadFailureCard prefix="최근 입출고 내역을 불러오지 못했습니다" message={errorMessage} comfortable retryLabel="다시 시도" onRetry={() => void query.refetch()} />;
  } else if (logs.length === 0 && !query.isError) {
    content = <EmptyState compact illustrated className="inventory-recent-empty" title="최근 입출고 내역이 없습니다." description="" />;
  } else {
    content = (
      <div className="inventory-recent-groups">
        <HistoryRows logs={logs} mobilePresentation={mobilePresentation} />
        {query.isError && <LoadFailureCard
          prefix={query.isFetchNextPageError ? "다음 내역을 불러오지 못했습니다" : "내역을 새로고침하지 못했습니다"}
          message={errorMessage} comfortable retryLabel="다시 시도"
          onRetry={query.isFetchNextPageError ? loadMore : () => void query.refetch()}
        />}
        {!query.isError && query.hasNextPage && <Button
          variant="ghost" className="mt-3 min-h-11 w-full text-sm" disabled={query.isFetching}
          onClick={loadMore}
        >{query.isFetchingNextPage ? "불러오는 중..." : "더 보기"}</Button>}
      </div>
    );
  }
  return <div className={`inventory-recent-panel${mobilePresentation ? ` ${mobileStyles.mobile}` : ""}`}>{content}</div>;
}
