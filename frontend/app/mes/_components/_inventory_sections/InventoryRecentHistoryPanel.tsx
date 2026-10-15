"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { InventoryOperation, Item, TransactionLog, TransactionType } from "@/lib/api";
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
import { historyDisplayLogs } from "../_history_sections/stocktakeHistory";
import { historyOperationColor } from "../_history_sections/historyOperationSource";
import { InventoryOperationDetail, operationSummary } from "../_history_sections/InventoryOperationDetail";
import { inventoryOperationLabel } from "../_history_sections/inventoryOperationPresentation";

type RecentEntry = { key: string; effectiveAt: string; createdAt: string } & (
  { log: TransactionLog; operation?: never } | { log?: never; operation: InventoryOperation }
);

/** 전체 작업 중 현재 품목의 행만 중복 없이 날짜순으로 표시한다. */
function getRecentEntries(pages: TransactionDisplayGroupPage[], itemId: string): RecentEntry[] {
  const logs = new Map<string, TransactionLog>();
  const operations = new Map<string, InventoryOperation>();
  for (const page of pages) {
    for (const log of historyDisplayLogs(page.groups)) {
      if (log.item_id === itemId) logs.set(log.log_id, log);
    }
    for (const group of page.groups) if (group.operation) operations.set(group.operation.operationId, group.operation);
  }
  const representedIds = new Set([...logs.values()].map(log => log.operation_id));
  const entries: RecentEntry[] = [
    ...[...logs.values()].map(log => ({ key: log.log_id, effectiveAt: log.requested_at ?? log.created_at, createdAt: log.created_at, log })),
    ...[...operations.values()].filter(operation => !representedIds.has(operation.operationId))
      .map(operation => ({ key: operation.operationId, effectiveAt: operation.effectiveAt, createdAt: operation.effectiveAt, operation })),
  ];
  return entries.sort((left, right) =>
    parseUtc(right.effectiveAt).getTime() - parseUtc(left.effectiveAt).getTime()
    || parseUtc(right.createdAt).getTime() - parseUtc(left.createdAt).getTime()
    || right.key.localeCompare(left.key),
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
  onSelect,
}: {
  type: TransactionType;
  label: string;
  log: TransactionLog | null;
  context: string;
  effectiveAt: string;
  cancelled: boolean;
  mobilePresentation?: boolean;
  onSelect: (id: string) => void;
}): ReactNode {
  const color = log && isReworkOperation(log) ? LEGACY_COLORS.red : log ? historyOperationColor(log, type) : transactionColor(type);
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
        {log?.operation_id && <Button variant="ghost" className="min-h-11 text-sm" onClick={() => onSelect(log.operation_id!)}>작업 상세 보기</Button>}
      </div>
    </li>
  );
}

function HistoryRows({ entries, mobilePresentation, onSelect }: { entries: RecentEntry[]; mobilePresentation: boolean; onSelect: (id: string) => void }): ReactNode {
  return (
    <ul className="inventory-recent">
      {entries.map((entry) => {
        const operation = entry.operation;
        if (operation) return <li key={entry.key} data-cancelled={operation.effectiveStatus === "cancelled" || undefined}>
        <div className="inventory-recent-main"><strong>{inventoryOperationLabel(operation)}</strong><time dateTime={entry.effectiveAt}>{formatHistoryDate(entry.effectiveAt)}</time></div>
        <div className="inventory-recent-body">
          <p>{operationSummary(operation)}</p>
          <div className="inventory-recent-meta">{[operation.department, operation.actorName].filter(Boolean).join(" · ")}</div>
          {operation.effectiveStatus === "cancelled" && <span className="inventory-recent-cancelled">취소된 작업</span>}
          <Button variant="ghost" className="min-h-11 text-sm" onClick={() => onSelect(operation.operationId)}>작업 상세 보기</Button>
        </div>
      </li>;
        const log = entry.log!;
        // 요청 연결이 없는 이전 직접 처리 기록만 기록자의 이름을 사용한다.
        const requester = log.requester_name?.trim()
          || (!log.operation_batch_id && !log.history_batch && !log.approver_name?.trim() ? log.produced_by?.trim() : null)
          || "요청자 기록 없음";
        return (
        <RecentLine
          key={log.log_id}
          onSelect={onSelect}
          mobilePresentation={mobilePresentation}
          type={log.transaction_type}
          label={getHistoryLabel(log)}
          log={log}
          context={[log.department, requester]
            .filter((value): value is string => Boolean(value?.trim()))
            .join(" · ") || log.reference_no || "업무 정보 없음"}
          effectiveAt={log.requested_at ?? log.created_at}
          cancelled={log.cancelled || log.operation_effective_status === "cancelled"}
        />
      ); })}
    </ul>
  );
}

export function InventoryRecentHistoryPanel({ item, mobilePresentation = false }: { item: Item; mobilePresentation?: boolean }): ReactNode {
  const query = useItemHistoryPagesQuery(item.item_id);
  const [selection, setSelection] = useState<{ itemId: string; operationId: string | null }>({ itemId: item.item_id, operationId: null });
  // 품목이 바뀌면 선택 자체를 지워 A→B→A에서도 이전 상세가 다시 열리지 않는다.
  if (selection.itemId !== item.item_id) setSelection({ itemId: item.item_id, operationId: null });
  const selectOperation = (operationId: string | null): void => setSelection({ itemId: item.item_id, operationId });
  const entries = useMemo(() => getRecentEntries(query.data?.pages ?? [], item.item_id), [query.data, item.item_id]);
  const errorMessage = query.error?.message || "잠시 후 다시 시도해 주세요.";
  const loadMore = (): void => {
    if (query.hasNextPage && !query.isFetching) void query.fetchNextPage({ cancelRefetch: false });
  };

  let content: ReactNode;
  if (selection.itemId === item.item_id && selection.operationId) {
    content = <InventoryOperationDetail operationId={selection.operationId} onBack={() => selectOperation(null)} onNavigate={selectOperation} />;
  } else if (query.isPending) {
    content = <LoadingSkeleton rows={3} />;
  } else if (query.isError && !query.data) {
    content = <LoadFailureCard prefix="최근 입출고 내역을 불러오지 못했습니다" message={errorMessage} comfortable retryLabel="다시 시도" onRetry={() => void query.refetch()} />;
  } else if (entries.length === 0 && !query.isError) {
    content = <EmptyState compact illustrated className="inventory-recent-empty" title="최근 입출고 내역이 없습니다." description="" />;
  } else {
    content = (
      <div className="inventory-recent-groups">
        <HistoryRows entries={entries} mobilePresentation={mobilePresentation} onSelect={selectOperation} />
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
