"use client";

import { Loader2 } from "lucide-react";
import type { TransactionLog } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import type { IoBatch } from "@/lib/api/types/io";
import { useHistoryBatchMetadata } from "../../_hooks/useHistoryBatchMetadata";
import { ReadEmpty, ReadFailure } from "../../common/ReadState";
import { dataRevealClassName } from "../../common/LoadingSkeleton";
import { formatHistoryDate } from "../../_history_sections/historyFormat";
import {
  getHistoryActor,
} from "../../_history_sections/historyBatchInterpreter";
import { FlowBadge, getHistoryGroupSummary, type LogGroup } from "../../_history_sections/historyTableHelpers";
import styles from "./MobileHistoryList.module.css";

function HistoryListHeader({ summary }: { summary: ReturnType<typeof getHistoryGroupSummary> }) {
  const log = summary.primaryLog;
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={`shrink-0 ${styles.affected} ${styles.badge}`}>
        <FlowBadge type={summary.displayType} label={summary.label} color={summary.color} />
      </span>
      <div className="ml-auto flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{getHistoryActor(log)}</span>
        <span className={`shrink-0 text-xs font-semibold ${styles.affected}`} style={{ color: LEGACY_COLORS.muted2 }}>
          {formatHistoryDate(log.requested_at ?? log.created_at)}
        </span>
      </div>
    </div>
  );
}

/**
 * 입출고 내역 모바일 카드 리스트.
 *
 * 데스크탑 HistoryTable(와이드 6열 테이블 — 393px 에서 우측 잘림)을 대체.
 * 묶음 그룹화는 동일 순수함수 buildGroups 를 그대로 재사용(golden 무관 호출).
 * 행 탭 → 부모가 BottomSheet 상세를 연다.
 */
export function MobileHistoryList({
  loading,
  hasSearch = false,
  hasFilters = false,
  onResetFilters,
  error,
  refreshError,
  displayGroups,
  batchCache,
  setBatchCache,
  cacheEpoch,
  loadMoreError,
  selectedKey,
  onSelectLog,
  onSelectBatch,
  onSelectSubmission,
  onSelectReadOnlyLog,
  onRetry,
  onRetryRefresh,
  canLoadMore,
  loadingMore,
  onLoadMore,
}: {
  loading: boolean;
  hasSearch?: boolean;
  hasFilters?: boolean;
  onResetFilters?: () => void;
  error: string | null;
  refreshError?: string | null;
  displayGroups: LogGroup[];
  batchCache: Map<string, IoBatch>;
  setBatchCache: React.Dispatch<React.SetStateAction<Map<string, IoBatch>>>;
  cacheEpoch?: number | null;
  loadMoreError?: string | null;
  selectedKey: string | null;
  onSelectLog: (log: TransactionLog) => void;
  onSelectBatch: (batchId: string, logs: TransactionLog[]) => void;
  onSelectSubmission?: (group: Extract<LogGroup, { type: "submission" }>) => void;
  onSelectReadOnlyLog?: (log: TransactionLog) => void;
  onRetry: () => void;
  onRetryRefresh?: () => void;
  canLoadMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  const metadata = useHistoryBatchMetadata(displayGroups, batchCache, setBatchCache, cacheEpoch);
  if (loading && displayGroups.length === 0) {
    return (
      <div role="status" aria-busy="true" aria-label="입출고 내역을 불러오고 있습니다…"
        className="overflow-hidden rounded-[20px] border" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
        <span className="sr-only">입출고 내역을 불러오고 있습니다…</span>
        <div aria-hidden="true">
          {Array.from({ length: 6 }, (_, row) => (
            <div key={row} className="flex h-[98px] flex-col justify-center border-b px-4 py-3"
              style={{ borderColor: LEGACY_COLORS.border }}>
              <div className="flex h-6 items-center justify-between gap-2">
                <span className="h-6 w-32 rounded-full motion-safe:animate-pulse" style={{ background: LEGACY_COLORS.s4 }} />
                <span className="h-4 w-28 rounded-[6px] motion-safe:animate-pulse" style={{ background: LEGACY_COLORS.s4 }} />
              </div>
              <div className="mt-2 flex h-10 items-center">
                <span className="h-5 w-2/3 rounded-[6px] motion-safe:animate-pulse" style={{ background: LEGACY_COLORS.s4 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (error && displayGroups.length === 0) {
    return (
      <div className="py-2">
        <ReadFailure
          message={error}
          onRetry={onRetry}
        />
      </div>
    );
  }
  if (displayGroups.length === 0) {
    return (
      <div className="py-10">
        {refreshError && <ReadFailure message={refreshError} onRetry={onRetryRefresh ?? onRetry} refresh />}
        <ReadEmpty hasSearch={hasSearch} hasFilters={hasFilters} onReset={onResetFilters} />
      </div>
    );
  }

  const groups = displayGroups;

  return (
    <div className="flex flex-col overflow-hidden rounded-[20px] border" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
      {(refreshError || error) && (
        <ReadFailure
          message={refreshError || error!}
          onRetry={refreshError ? onRetryRefresh ?? onRetry : onRetry}
          refresh
        />
      )}

      {metadata.failed && <ReadFailure message="작업 정보를 불러오지 못했습니다." onRetry={metadata.retry} refresh />}
      <div className={dataRevealClassName}>{groups.map((g) => {
        const summary = getHistoryGroupSummary(g, g.type === "op_batch" ? batchCache.get(g.batchId) : undefined, batchCache);
        const single = g.type === "solo";
        const logs = g.type === "solo" ? [g.log] : g.type === "defect_lifecycle" ? [g.parent, g.child] : g.logs;
        const cancelled = g.type === "submission" ? logs.every((log) => log.cancelled) : logs.some((log) => log.cancelled);
        const cancellation = summary.primaryLog.operation_kind === "CANCELLATION";
        const key = g.type === "solo" ? g.log.log_id : g.type === "defect_lifecycle" || g.type === "submission" ? g.key
          : g.type === "operation" ? g.operationId : g.type === "op_batch" ? g.batchId : g.refKey;
        const active = single
          ? selectedKey === `log:${summary.primaryLog.log_id}`
          : selectedKey === `${g.type === "submission" ? "submission" : "batch"}:${key}`;
        return (
          <button
            key={key}
            type="button"
            onClick={() => g.type === "submission" ? onSelectSubmission?.(g) : single ?
              g.allowCancellation === false ? onSelectReadOnlyLog?.(summary.primaryLog) : onSelectLog(summary.primaryLog) : onSelectBatch(key,
              g.type === "operation" ? [summary.primaryLog, ...logs.filter((log) => log.log_id !== summary.primaryLog.log_id)] : logs,
            )}
            aria-pressed={active}
            data-history-cancelled={cancelled || undefined}
            data-history-cancellation={cancellation || undefined}
            className={`flex h-[98px] min-h-[98px] max-h-[98px] w-full shrink-0 flex-col justify-center overflow-hidden border-b px-4 py-3 text-left transition-colors ${cancelled ? styles.cancelled : ""} ${cancellation ? styles.cancellation : ""}`}
            style={{
              background: active ? `color-mix(in srgb, ${summary.color} 8%, var(--c-s1))` : undefined,
              borderColor: active ? summary.color : LEGACY_COLORS.border,
            }}
          >
            <HistoryListHeader summary={summary} />
            <div className="mt-2 flex h-10 shrink-0 items-center gap-2">
              <span className={`line-clamp-2 min-w-0 whitespace-normal break-keep [overflow-wrap:anywhere] text-[15px] font-bold leading-5 ${styles.affected}`} style={{ color: LEGACY_COLORS.text }}>
                {summary.title}
                {summary.additionalItemCount > 0 && (
                  <span style={{ color: LEGACY_COLORS.muted2 }}> 외 {summary.additionalItemCount}{g.type === "submission" ? "품목" : "건"}</span>
                )}
              </span>
              {cancelled && <span className={styles.cancelledLabel}>취소됨</span>}
            </div>
          </button>
        );
      })}</div>

      {loadMoreError && <ReadFailure message={loadMoreError} onRetry={onLoadMore} refresh />}
      {canLoadMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
          className="mt-1 min-h-[44px] w-full rounded-[14px] border text-sm font-bold disabled:opacity-50"
          style={{
            borderColor: LEGACY_COLORS.border,
            color: LEGACY_COLORS.blue,
          }}
        >
          {loadingMore ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              불러오는 중…
            </span>
          ) : (
            "더 보기"
          )}
        </button>
      )}
    </div>
  );
}
