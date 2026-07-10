"use client";

import { Layers, Loader2, Package } from "lucide-react";
import type { TransactionLog } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { transactionColor } from "@/lib/mes-status";
import { EmptyState, LoadFailureCard, LoadingSkeleton } from "../../common";
import { formatHistoryDate } from "../../_history_sections/historyFormat";
import { rowTint } from "../../_history_sections/historyTheme";
import {
  getHistoryActor,
  getHistoryDisplayLabel,
  getSingleLogMovement,
} from "../../_history_sections/historyBatchInterpreter";
import { MovementSummaryCell, buildGroups } from "../../_history_sections/historyTableHelpers";

/**
 * 입출고 내역 모바일 카드 리스트.
 *
 * 데스크탑 HistoryTable(와이드 6열 테이블 — 393px 에서 우측 잘림)을 대체.
 * 묶음 그룹화는 동일 순수함수 buildGroups 를 그대로 재사용(golden 무관 호출).
 * 행 탭 → 부모가 BottomSheet 상세를 연다.
 */
export function MobileHistoryList({
  loading,
  error,
  filteredLogs,
  selectedKey,
  onSelectLog,
  onSelectBatch,
  onRetry,
  canLoadMore,
  loadingMore,
  onLoadMore,
}: {
  loading: boolean;
  error: string | null;
  filteredLogs: TransactionLog[];
  selectedKey: string | null;
  onSelectLog: (log: TransactionLog) => void;
  onSelectBatch: (batchId: string, logs: TransactionLog[]) => void;
  onRetry: () => void;
  canLoadMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  if (loading) {
    return (
      <div className="py-2">
        <LoadingSkeleton variant="list" rows={8} />
      </div>
    );
  }
  if (error && filteredLogs.length === 0) {
    return (
      <div className="py-2">
        <LoadFailureCard
          message={error}
          onRetry={onRetry}
          retryLabel="다시 시도"
          prefix="입출고 내역을 불러오지 못했습니다"
        />
      </div>
    );
  }
  if (filteredLogs.length === 0) {
    return (
      <div className="py-10">
        <EmptyState variant="no-data" />
      </div>
    );
  }

  const groups = buildGroups(filteredLogs);

  return (
    <div className="flex flex-col gap-2 pb-4">
      {groups.map((g) => {
        if (g.type === "solo") {
          const log = g.log;
          const tcolor = transactionColor(log.transaction_type);
          const active = selectedKey === `log:${log.log_id}`;
          return (
            <button
              key={log.log_id}
              type="button"
              onClick={() => onSelectLog(log)}
              aria-pressed={active}
              className="w-full min-h-[60px] rounded-[16px] border p-3 text-left transition-[transform] active:scale-[0.99]"
              style={{
                background: active ? "rgba(101,169,255,.12)" : rowTint(log.transaction_type),
                borderColor: active ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold"
                  style={{
                    background: `color-mix(in srgb, ${tcolor} 16%, transparent)`,
                    color: LEGACY_COLORS.text,
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: tcolor }}
                  />
                  {getHistoryDisplayLabel(log)}
                </span>
                <span className="text-xs font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
                  {formatHistoryDate(log.requested_at ?? log.created_at)}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <Package className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
                <span
                  className="truncate text-sm font-bold"
                  style={{ color: LEGACY_COLORS.text }}
                >
                  {log.item_name}
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                  {getHistoryActor(log)}
                </span>
                <MovementSummaryCell summary={{ parts: [getSingleLogMovement(log)] }} />
              </div>
            </button>
          );
        }

        // batch | op_batch — 묶음 카드
        if (g.type === "defect_lifecycle") {
          const parent = g.parent;
          const tcolor = transactionColor(parent.transaction_type);
          const active = selectedKey === `log:${parent.log_id}`;
          return (
            <button
              key={g.key}
              type="button"
              onClick={() => onSelectLog(parent)}
              aria-pressed={active}
              className="w-full min-h-[60px] rounded-[16px] border p-3 text-left transition-[transform] active:scale-[0.99]"
              style={{
                background: active ? "rgba(101,169,255,.12)" : rowTint(parent.transaction_type),
                borderColor: active ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold"
                  style={{
                    background: `color-mix(in srgb, ${tcolor} 16%, transparent)`,
                    color: LEGACY_COLORS.text,
                  }}
                >
                  <Layers className="h-3.5 w-3.5" style={{ color: tcolor }} />
                  {getHistoryDisplayLabel(parent)}
                </span>
                <span className="text-xs font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
                  {formatHistoryDate(parent.requested_at ?? parent.created_at)}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <Package className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
                <span className="truncate text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>
                  {parent.item_name}
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                  {getHistoryActor(parent)}
                </span>
                <MovementSummaryCell summary={{ parts: [getSingleLogMovement(g.child)] }} />
              </div>
            </button>
          );
        }

        const logs = g.logs;
        const first = logs[0];
        const key = g.type === "op_batch" ? g.batchId : g.refKey;
        const active = selectedKey === `batch:${key}`;
        const tcolor = transactionColor(first.transaction_type);
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelectBatch(key, logs)}
            aria-pressed={active}
            className="w-full min-h-[60px] rounded-[16px] border p-3 text-left transition-[transform] active:scale-[0.99]"
            style={{
              background: active ? "rgba(101,169,255,.12)" : rowTint(first.transaction_type),
              borderColor: active ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold"
                style={{
                  background: `color-mix(in srgb, ${tcolor} 16%, transparent)`,
                  color: LEGACY_COLORS.text,
                }}
              >
                <Layers className="h-3.5 w-3.5" style={{ color: tcolor }} />
                {getHistoryDisplayLabel(first)}
              </span>
              <span className="text-xs font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
                {formatHistoryDate(first.requested_at ?? first.created_at)}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <Package className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
              <span className="truncate text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>
                {first.item_name}
                {logs.length > 1 && (
                  <span style={{ color: LEGACY_COLORS.muted2 }}> 외 {logs.length - 1}건</span>
                )}
              </span>
            </div>
            <div className="mt-1.5 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              {getHistoryActor(first)} · 묶음 {logs.length}건
            </div>
          </button>
        );
      })}

      {canLoadMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
          className="mt-1 min-h-[44px] w-full rounded-[14px] border text-sm font-bold disabled:opacity-50"
          style={{
            background: LEGACY_COLORS.s2,
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
