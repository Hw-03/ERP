"use client";

import { Loader2 } from "lucide-react";
import type { TransactionLog } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { transactionColor } from "@/lib/mes-status";
import { ReadEmpty, ReadFailure } from "../../common/ReadState";
import { dataRevealClassName } from "../../common/LoadingSkeleton";
import { formatHistoryDate } from "../../_history_sections/historyFormat";
import {
  getHistoryActor,
  getHistoryDisplayLabel,
} from "../../_history_sections/historyBatchInterpreter";
import { FlowBadge, buildGroups } from "../../_history_sections/historyTableHelpers";

function HistoryListHeader({ log }: { log: TransactionLog }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="shrink-0">
        <FlowBadge type={log.transaction_type} label={getHistoryDisplayLabel(log)} color={transactionColor(log.transaction_type)} />
      </span>
      <div className="ml-auto flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{getHistoryActor(log)}</span>
        <span className="shrink-0 text-xs font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
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
  filteredLogs,
  selectedKey,
  onSelectLog,
  onSelectBatch,
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
  filteredLogs: TransactionLog[];
  selectedKey: string | null;
  onSelectLog: (log: TransactionLog) => void;
  onSelectBatch: (batchId: string, logs: TransactionLog[]) => void;
  onRetry: () => void;
  onRetryRefresh?: () => void;
  canLoadMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  if (loading && filteredLogs.length === 0) {
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
  if (error && filteredLogs.length === 0) {
    return (
      <div className="py-2">
        <ReadFailure
          message={error}
          onRetry={onRetry}
        />
      </div>
    );
  }
  if (filteredLogs.length === 0) {
    return (
      <div className="py-10">
        {refreshError && <ReadFailure message={refreshError} onRetry={onRetryRefresh ?? onRetry} refresh />}
        <ReadEmpty hasSearch={hasSearch} hasFilters={hasFilters} onReset={onResetFilters} />
      </div>
    );
  }

  const groups = buildGroups(filteredLogs);

  return (
    <div className="flex flex-col overflow-hidden rounded-[20px] border" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
      {(refreshError || error) && (
        <ReadFailure
          message={refreshError || error!}
          onRetry={refreshError ? onRetryRefresh ?? onRetry : onRetry}
          refresh
        />
      )}

      <div className={dataRevealClassName}>{groups.map((g) => {
        if (g.type === "solo") {
          const log = g.log;
          const active = selectedKey === `log:${log.log_id}`;
          return (
            <button
              key={log.log_id}
              type="button"
              onClick={() => onSelectLog(log)}
              aria-pressed={active}
              className="flex h-[98px] min-h-[98px] max-h-[98px] w-full shrink-0 flex-col justify-center overflow-hidden border-b px-4 py-3 text-left transition-colors"
              style={{
                background: active ? "color-mix(in srgb, var(--c-blue) 8%, var(--c-s1))" : undefined,
                borderColor: active ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
              }}
            >
              <HistoryListHeader log={log} />
              <div className="mt-2 flex h-10 shrink-0 items-center">
                <span
                  className="line-clamp-2 min-w-0 whitespace-normal break-keep [overflow-wrap:anywhere] text-[15px] font-bold leading-5"
                  style={{ color: LEGACY_COLORS.text }}
                >
                  {log.item_name}
                </span>
              </div>
            </button>
          );
        }

        // batch | op_batch — 묶음 카드
        if (g.type === "defect_lifecycle") {
          const parent = g.parent;
          const active = selectedKey === `log:${parent.log_id}`;
          return (
            <button
              key={g.key}
              type="button"
              onClick={() => onSelectLog(parent)}
              aria-pressed={active}
              className="flex h-[98px] min-h-[98px] max-h-[98px] w-full shrink-0 flex-col justify-center overflow-hidden border-b px-4 py-3 text-left transition-colors"
              style={{
                background: active ? "color-mix(in srgb, var(--c-blue) 8%, var(--c-s1))" : undefined,
                borderColor: active ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
              }}
            >
              <HistoryListHeader log={parent} />
              <div className="mt-2 flex h-10 shrink-0 items-center">
                <span className="line-clamp-2 min-w-0 whitespace-normal break-keep [overflow-wrap:anywhere] text-[15px] font-bold leading-5" style={{ color: LEGACY_COLORS.text }}>
                  {parent.item_name}
                </span>
              </div>
            </button>
          );
        }

        const logs = g.logs;
        const first = logs[0];
        const key =
          g.type === "operation"
            ? g.operationId
            : g.type === "op_batch"
              ? g.batchId
              : g.refKey;
        const active = selectedKey === `batch:${key}`;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelectBatch(key, logs)}
            aria-pressed={active}
            className="flex h-[98px] min-h-[98px] max-h-[98px] w-full shrink-0 flex-col justify-center overflow-hidden border-b px-4 py-3 text-left transition-colors"
            style={{
              background: active ? "color-mix(in srgb, var(--c-blue) 8%, var(--c-s1))" : undefined,
              borderColor: active ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
            }}
          >
            <HistoryListHeader log={first} />
            <div className="mt-2 flex h-10 shrink-0 items-center">
              <span className="line-clamp-2 min-w-0 whitespace-normal break-keep [overflow-wrap:anywhere] text-[15px] font-bold leading-5" style={{ color: LEGACY_COLORS.text }}>
                {first.item_name}
                {logs.length > 1 && (
                  <span style={{ color: LEGACY_COLORS.muted2 }}> 외 {logs.length - 1}건</span>
                )}
              </span>
            </div>
          </button>
        );
      })}</div>

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
