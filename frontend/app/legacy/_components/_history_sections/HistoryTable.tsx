"use client";

import { ChevronDown } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TransactionLog } from "@/lib/api";
import { ioApi } from "@/lib/api/io";
import type { IoBatch } from "@/lib/api/types/io";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { EmptyState, LoadingSkeleton } from "../common";
import { formatHistoryDate } from "./historyFormat";
import type { HistorySelection } from "./historyConstants";
import { HistoryLogRow } from "./HistoryLogRow";
import { BatchHeader, OpBatchHeader, buildGroups } from "./historyTableHelpers";
import { BomBatchDetail } from "./BomBatchDetail";

type Props = {
  loading: boolean;
  filteredLogs: TransactionLog[];
  /** 조건 전체 카운트(서버 summary). 헤더 진행률(`100/342건`) 표시용. */
  totalCount?: number;
  selection: HistorySelection | null;
  onSelectLog: (log: TransactionLog) => void;
  onSelectBatch: (batchId: string, logs: TransactionLog[]) => void;
  /** 부모(DesktopHistoryView)가 들고 있는 batchCache — 우측 패널과 공유. */
  batchCache: Map<string, IoBatch>;
  setBatchCache: React.Dispatch<React.SetStateAction<Map<string, IoBatch>>>;
  canLoadMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
};

const COLUMNS: { label: string; width?: string; minWidth?: string; align?: "left" | "center"; hidden?: boolean }[] = [
  { label: "일시", width: "140px" },
  { label: "구분", width: "130px" },
  { label: "품목명", minWidth: "180px" },
  { label: "변동요약", width: "150px", align: "center" },
  { label: "담당자", width: "130px", align: "center", hidden: true },
  { label: "메모", width: "70px", align: "center", hidden: true },
];

const VISIBLE_FETCH_CONCURRENCY = 4;

export function HistoryTable({
  loading,
  filteredLogs,
  totalCount,
  selection,
  onSelectLog,
  onSelectBatch,
  batchCache,
  setBatchCache,
  canLoadMore,
  loadingMore,
  onLoadMore,
}: Props) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const groups = useMemo(() => buildGroups(filteredLogs), [filteredLogs]);

  const batchKeys = useMemo(
    () => groups.flatMap((g) =>
      g.type === "batch" ? [g.refNo] : g.type === "op_batch" ? [g.batchId] : []
    ),
    [groups],
  );

  // ── visible op_batch lazy fetch ──
  // observer 는 마운트 시 한 번만. batchCache 변경마다 재생성하지 않게 ref 만 본다.
  // observedRowsRef: row ref callback 이 observer 생성 전에 먼저 와도 누락 없도록 보존.
  const mountedRef = useRef(true);
  const pendingFetchesRef = useRef<Set<string>>(new Set());
  const fetchQueueRef = useRef<string[]>([]);
  const inFlightRef = useRef(0);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const observedRowsRef = useRef<Set<HTMLTableRowElement>>(new Set());
  const batchCacheRef = useRef(batchCache);
  batchCacheRef.current = batchCache;

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
  }, [setBatchCache]);

  const enqueueBatchFetch = useCallback((batchId: string) => {
    if (batchCacheRef.current.has(batchId)) return;
    if (pendingFetchesRef.current.has(batchId)) return;
    pendingFetchesRef.current.add(batchId);
    fetchQueueRef.current.push(batchId);
    tryDrainQueue();
  }, [tryDrainQueue]);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = (entry.target as HTMLElement).dataset.batchId;
          if (id) enqueueBatchFetch(id);
        }
      },
      { rootMargin: "120px" },
    );
    observerRef.current = obs;
    // ref callback 이 먼저 실행되며 모인 row 들을 일괄 observe (누락 보완).
    observedRowsRef.current.forEach((el) => obs.observe(el));
    return () => {
      obs.disconnect();
      observerRef.current = null;
    };
  }, [enqueueBatchFetch]);

  const opBatchRowRef = useCallback((el: HTMLTableRowElement | null) => {
    if (!el) return;
    observedRowsRef.current.add(el);
    observerRef.current?.observe(el);
  }, []);

  // op_batch IoBatch eager 프리페치 — 접힌 묶음도 batch.sub_type 기준 구분 라벨/
  // 변동요약이 즉시 정확해지도록(재작업 묶음이 접힘에서 "생산 등록"으로 오표시 방지, 3차 C7).
  // 동시성 큐(VISIBLE_FETCH_CONCURRENCY)·dedup 은 enqueueBatchFetch 가 처리.
  useEffect(() => {
    for (const g of groups) {
      if (g.type === "op_batch") enqueueBatchFetch(g.batchId);
    }
  }, [groups, enqueueBatchFetch]);

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function expandGroup(key: string) {
    setExpandedGroups((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }

  function collapseGroup(key: string) {
    setExpandedGroups((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
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

  // selection helpers
  const selectedLogId = selection?.kind === "log" ? selection.log.log_id : undefined;
  const selectedBatchId = selection?.kind === "batch" ? selection.batchId : undefined;

  return (
    <section className="card" style={{ backgroundImage: "linear-gradient(rgba(101,169,255,.04), rgba(101,169,255,.04))" }}>
      <div
        className="sticky top-0 z-20 -mx-5 -mt-5 mb-4 flex items-center gap-3 rounded-t-[28px] px-5 pb-3 pt-5"
        style={{ background: LEGACY_COLORS.bg, backgroundImage: "linear-gradient(rgba(101,169,255,.04), rgba(101,169,255,.04))" }}
      >
        <div className="shrink-0 text-base font-bold">입출고 내역</div>
        <span className="text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
          {filteredLogs.length}{totalCount != null ? ` / ${totalCount}` : ""}건
        </span>
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
                {COLUMNS.map(({ label, width, minWidth, align, hidden }) => (
                  <th
                    key={label}
                    scope="col"
                    className={`whitespace-nowrap border-b px-4 py-3 text-xs font-bold${hidden ? " hidden sm:table-cell" : ""} ${align === "center" ? "text-center" : "text-left"}`}
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
                  const isSelected = selectedBatchId === group.batchId;
                  return (
                    <Fragment key={`op-${group.batchId}`}>
                      <OpBatchHeader
                        group={group}
                        expanded={expanded}
                        onToggle={() => toggleGroup(group.batchId)}
                        selected={isSelected}
                        onSelect={() => {
                          // 같은 묶음 재클릭 → 부모 selection 토글로 닫힘 + 펼침도 동시 접음.
                          onSelectBatch(group.batchId, group.logs);
                          if (isSelected) collapseGroup(group.batchId);
                          else expandGroup(group.batchId);
                        }}
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
                // op_batch 가 아니라 IoBatch 가 없으므로 클릭 시 첫 로그 상세를 연다.
                const expanded = expandedGroups.has(group.refNo);
                const isSelected = selectedLogId === group.logs[0]?.log_id;
                return (
                  <Fragment key={`ref-${group.refNo}`}>
                    <BatchHeader
                      group={group}
                      expanded={expanded}
                      onToggle={() => toggleGroup(group.refNo)}
                      selected={isSelected}
                      onSelect={() => {
                        onSelectLog(group.logs[0]);
                        expandGroup(group.refNo);
                      }}
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
