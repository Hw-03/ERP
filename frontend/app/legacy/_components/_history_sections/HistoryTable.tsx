"use client";

import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from "react";
import type { TransactionLog } from "@/lib/api";
import { ioApi } from "@/lib/api/io";
import type { IoBatch } from "@/lib/api/types/io";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { EmptyState, LoadingSkeleton } from "../common";
import { formatHistoryDate } from "./historyShared";
import { HistoryLogRow } from "./HistoryLogRow";
import { BatchHeader, OpBatchHeader, buildGroups } from "./historyTableHelpers";
import { BomBatchDetail } from "./BomBatchDetail";

type Props = {
  loading: boolean;
  filteredLogs: TransactionLog[];
  selectedLogId: string | undefined;
  onSelectLog: (log: TransactionLog) => void;
  canLoadMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
};

const COLUMNS: { label: string; width?: string; minWidth?: string }[] = [
  { label: "일시", width: "140px" },
  { label: "구분", width: "120px" },
  { label: "품목명", minWidth: "160px" },
  { label: "수량변화", width: "140px" },
  { label: "담당자", width: "100px" },
  { label: "메모", minWidth: "120px" },
];

const VISIBLE_FETCH_CONCURRENCY = 4;

export function HistoryTable({
  loading,
  filteredLogs,
  selectedLogId,
  onSelectLog,
  canLoadMore,
  loadingMore,
  onLoadMore,
}: Props) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [batchCache, setBatchCache] = useState<Map<string, IoBatch>>(new Map());

  const groups = useMemo(() => buildGroups(filteredLogs), [filteredLogs]);

  const batchKeys = useMemo(
    () => groups.flatMap((g) =>
      g.type === "batch" ? [g.refNo] : g.type === "op_batch" ? [g.batchId] : []
    ),
    [groups],
  );

  // ── visible op_batch lazy fetch ──
  const mountedRef = useRef(true);
  const pendingFetchesRef = useRef<Set<string>>(new Set());
  const fetchQueueRef = useRef<string[]>([]);
  const inFlightRef = useRef(0);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const tryDrainQueue = useCallback(() => {
    while (inFlightRef.current < VISIBLE_FETCH_CONCURRENCY && fetchQueueRef.current.length > 0) {
      const next = fetchQueueRef.current.shift()!;
      inFlightRef.current++;
      void ioApi.getBatch(next)
        .then((b) => {
          if (mountedRef.current) {
            setBatchCache((prev) => {
              if (prev.has(next)) return prev;
              const m = new Map(prev);
              m.set(next, b);
              return m;
            });
          }
        })
        .catch(() => { /* 무시 — 다음 시도에서 재요청 가능. */ })
        .finally(() => {
          pendingFetchesRef.current.delete(next);
          inFlightRef.current--;
          if (mountedRef.current) tryDrainQueue();
        });
    }
  }, []);

  const enqueueBatchFetch = useCallback((batchId: string) => {
    if (batchCache.has(batchId)) return;
    if (pendingFetchesRef.current.has(batchId)) return;
    pendingFetchesRef.current.add(batchId);
    fetchQueueRef.current.push(batchId);
    tryDrainQueue();
  }, [batchCache, tryDrainQueue]);

  // 그룹 변경 시 옵저버 재구성
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    observerRef.current?.disconnect();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = (entry.target as HTMLElement).dataset.batchId;
          if (id) enqueueBatchFetch(id);
        }
      },
      { rootMargin: "120px" },
    );
    return () => observerRef.current?.disconnect();
  }, [enqueueBatchFetch]);

  const opBatchRowRef = useCallback((el: HTMLTableRowElement | null) => {
    if (!el || !observerRef.current) return;
    observerRef.current.observe(el);
  }, []);

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleCacheBatch(batchId: string, batch: IoBatch) {
    setBatchCache((prev) => {
      if (prev.has(batchId)) return prev;
      const m = new Map(prev);
      m.set(batchId, batch);
      return m;
    });
  }

  const allExpanded = batchKeys.length > 0 && batchKeys.every((k) => expandedGroups.has(k));

  function toggleAll() {
    if (allExpanded) setExpandedGroups(new Set());
    else setExpandedGroups(new Set(batchKeys));
  }

  return (
    <section className="card" style={{ backgroundImage: "linear-gradient(rgba(101,169,255,.04), rgba(101,169,255,.04))" }}>
      <div
        className="sticky top-0 z-20 -mx-5 -mt-5 mb-4 flex items-center gap-3 rounded-t-[28px] px-5 pb-3 pt-5"
        style={{ background: LEGACY_COLORS.bg, backgroundImage: "linear-gradient(rgba(101,169,255,.04), rgba(101,169,255,.04))" }}
      >
        <div className="shrink-0 text-base font-bold">입출고 내역</div>
        <span className="text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{filteredLogs.length}건</span>
        {filteredLogs.length > 0 && (
          <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
            {formatHistoryDate(filteredLogs[filteredLogs.length - 1].created_at)} ~ {formatHistoryDate(filteredLogs[0].created_at)}
          </span>
        )}
        {batchKeys.length > 0 && (
          <button
            onClick={toggleAll}
            className="ml-auto rounded-full border px-3 py-1 text-xs font-semibold transition-opacity hover:opacity-80"
            style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
          >
            {allExpanded ? "전체 접기" : "전체 펼치기"}
          </button>
        )}
      </div>

      {loading ? (
        <LoadingSkeleton variant="list" rows={8} />
      ) : filteredLogs.length === 0 ? (
        <EmptyState
          variant="no-data"
          title="거래 이력이 없습니다."
          description="조건에 맞는 거래가 없거나 아직 기록이 없습니다."
        />
      ) : (
        <div className="overflow-x-auto rounded-[24px] border" style={{ borderColor: LEGACY_COLORS.border }}>
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-10">
              <tr style={{ background: LEGACY_COLORS.s2 }}>
                {COLUMNS.map(({ label, width, minWidth }) => (
                  <th
                    key={label}
                    className="whitespace-nowrap border-b px-4 py-3 text-left text-xs font-bold"
                    style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2, width, minWidth }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => {
                if (group.type === "solo") {
                  return (
                    <HistoryLogRow
                      key={group.log.log_id}
                      log={group.log}
                      selected={selectedLogId === group.log.log_id}
                      onSelect={onSelectLog}
                    />
                  );
                }

                if (group.type === "op_batch") {
                  const expanded = expandedGroups.has(group.batchId);
                  const batch = batchCache.get(group.batchId) ?? null;
                  return (
                    <Fragment key={`op-${group.batchId}`}>
                      <OpBatchHeader
                        group={group}
                        expanded={expanded}
                        onToggle={() => toggleGroup(group.batchId)}
                        batch={batch}
                        rowRef={opBatchRowRef}
                      />
                      {expanded && (
                        <BomBatchDetail
                          batchId={group.batchId}
                          colSpan={COLUMNS.length}
                          cache={batchCache}
                          onCached={handleCacheBatch}
                        />
                      )}
                    </Fragment>
                  );
                }

                // type === "batch" (reference_no 기준 레거시 그룹)
                const expanded = expandedGroups.has(group.refNo);
                return (
                  <Fragment key={`ref-${group.refNo}`}>
                    <BatchHeader
                      group={group}
                      expanded={expanded}
                      onToggle={() => toggleGroup(group.refNo)}
                    />
                    {expanded &&
                      group.logs.map((log) => (
                        <HistoryLogRow
                          key={log.log_id}
                          log={log}
                          selected={selectedLogId === log.log_id}
                          onSelect={onSelectLog}
                        />
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {canLoadMore && (
        <button
          onClick={onLoadMore}
          disabled={loadingMore}
          className="mt-4 flex w-full items-center justify-center gap-2 py-3 text-base font-bold disabled:opacity-50"
          style={{ color: LEGACY_COLORS.blue }}
        >
          <ChevronDown className="h-4 w-4" />
          {loadingMore ? "불러오는 중..." : "100건 더보기"}
        </button>
      )}
    </section>
  );
}
