"use client";

import { ChevronDown } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TransactionLog } from "@/lib/api";
import type { TransactionReferenceSummary } from "@/lib/api/production";
import { ioApi } from "@/lib/api/io";
import type { IoBatch } from "@/lib/api/types/io";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { EmptyState, LoadFailureCard, LoadingSkeleton } from "../common";
import type { HistorySelection } from "./historyConstants";
import { HistoryLogRow } from "./HistoryLogRow";
import { BatchHeader, OpBatchHeader, ReferenceBatchDetail, buildGroups, getHistorySeparationHint, type LogGroup, HISTORY_CELL_TRANSITION } from "./historyTableHelpers";
import { BomBatchDetail } from "./BomBatchDetail";
import { ReworkBatchHeader } from "./ReworkBatchHeader";
import { ReworkBatchDetail } from "./ReworkBatchDetail";

export type HistoryTableFocusTarget = {
  groupKey: string;
  logId?: string | null;
  itemId?: string | null;
  nonce: number;
};

type Props = {
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  filteredLogs?: TransactionLog[];
  /** PC 그룹 API가 보장한 대표 행 경계. 제공되면 원본 로그를 다시 묶지 않는다. */
  displayGroups?: LogGroup[];
  selection: HistorySelection | null;
  onSelectLog: (log: TransactionLog) => void;
  /** 묶음 하위 행은 상세 조회만 허용하고 취소는 부모 행에 남긴다. */
  onSelectChildLog?: (log: TransactionLog) => void;
  onSelectBatch: (batchId: string, logs: TransactionLog[]) => void;
  /** 부모(DesktopHistoryView)가 들고 있는 batchCache — 우측 패널과 공유. */
  batchCache: Map<string, IoBatch>;
  setBatchCache: React.Dispatch<React.SetStateAction<Map<string, IoBatch>>>;
  canLoadMore: boolean;
  loadingMore: boolean;
  loadMoreError?: string | null;
  onLoadMore: () => void;
  focusTarget?: HistoryTableFocusTarget | null;
  referenceSummaries?: Map<string, TransactionReferenceSummary>;
  referenceSummariesLoading?: boolean;
};

type ColSpec = { label: string; width?: string; minWidth?: string; align?: "left" | "center" | "right"; hidden?: boolean; px?: string };

// 평상시(우측 패널 닫힘) — 현장 판단 순서: 언제 → 작업 → 대상 → 품목코드 → 수량/재고 → 상태.
const COLUMNS: ColSpec[] = [
  { label: "일시", width: "104px", align: "center" },
  { label: "작업", width: "168px", align: "center" },
  { label: "대상" },
  { label: "품목코드", width: "118px", align: "center" },
  { label: "수량", width: "270px", align: "center" },
  { label: "상태 · 처리", width: "180px", align: "center" },
];
const VISIBLE_FETCH_CONCURRENCY = 4;

function historyGroupPanelId(groupKey: string): string {
  return `history-group-${encodeURIComponent(groupKey).replaceAll("%", "_")}`;
}

function getGroupPrimaryLog(group: LogGroup): TransactionLog {
  if (group.type === "solo") return group.log;
  if (group.type === "defect_lifecycle") return group.parent;
  return group.logs[0];
}

export function HistoryTable({
  loading,
  error,
  onRetry,
  filteredLogs = [],
  displayGroups,
  selection,
  onSelectLog,
  onSelectChildLog,
  onSelectBatch,
  batchCache,
  setBatchCache,
  canLoadMore,
  loadingMore,
  loadMoreError,
  onLoadMore,
  focusTarget,
  referenceSummaries,
  referenceSummariesLoading = false,
}: Props) {
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);

  // 선택 변화에 따른 op_batch 자동 토글 — "선택해서 열린" 묶음만 자동 접힘.
  // 단건/다른 묶음/none 으로 selection 이 바뀌면 이전 선택 묶음 접기 + 새 묶음이면 펼침.
  // 수동 chevron 으로 펼친 다른 묶음은 그대로 유지(이전 selection 만 추적).
  const prevSelectedBatchRef = useRef<string | null>(null);
  useEffect(() => {
    const currentBatchId = selection?.kind === "batch" ? selection.batchId : null;
    const prevBatchId = prevSelectedBatchRef.current;
    prevSelectedBatchRef.current = currentBatchId;
    if (prevBatchId === currentBatchId) return;
    if (currentBatchId) {
      setExpandedGroupKey(currentBatchId);
    } else if (prevBatchId) {
      setExpandedGroupKey((prev) => (prev === prevBatchId ? null : prev));
    }
  }, [selection]);

  useEffect(() => {
    if (!focusTarget) return;
    setExpandedGroupKey(focusTarget.groupKey);
    const handle = window.setTimeout(() => {
      const el = document.querySelector('[data-history-focus-line="true"]') as HTMLElement | null;
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 80);
    return () => window.clearTimeout(handle);
  }, [focusTarget]);

  const localGroups = useMemo(() => buildGroups(filteredLogs), [filteredLogs]);
  const groups = displayGroups ?? localGroups;

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
    setExpandedGroupKey((prev) => (prev === key ? null : key));
  }

  function expandGroup(key: string) {
    setExpandedGroupKey(key);
  }

  function collapseGroup(key: string) {
    setExpandedGroupKey((prev) => (prev === key ? null : prev));
  }

  function handleCacheBatch(batchId: string, batch: IoBatch) {
    setBatchCache((prev) => {
      if (prev.has(batchId)) return prev;
      const m = new Map(prev);
      m.set(batchId, batch);
      return m;
    });
  }

  // selection helpers
  const selectedLogId = selection?.kind === "log" ? selection.log.log_id : undefined;
  const selectedBatchId = selection?.kind === "batch" ? selection.batchId : undefined;

  return (
    <div className="min-w-0">
      {loading ? (
        <LoadingSkeleton variant="list" rows={8} />
      ) : error ? (
        <LoadFailureCard
          message={error}
          onRetry={onRetry}
          retryLabel="다시 시도"
          prefix="입출고 내역을 불러오지 못했습니다"
        />
      ) : groups.length === 0 ? (
        <EmptyState
          variant="no-data"
          title="거래 이력이 없습니다."
          description="조건에 맞는 거래가 없거나 아직 기록이 없습니다."
        />
      ) : (
        <div className="min-w-0 overflow-x-hidden rounded-[24px] border" style={{ borderColor: LEGACY_COLORS.border }}>
          <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
            <thead>
              <tr style={{ background: LEGACY_COLORS.s2 }}>
                {COLUMNS.map(({ label, width, minWidth, align, hidden, px }, index) => (
                  <th
                    key={label || `spacer-${index}`}
                    scope={label ? "col" : undefined}
                    aria-hidden={label ? undefined : true}
                    className={`sticky top-0 z-10 whitespace-nowrap border-b ${px ?? "px-4"} py-3 text-xs font-bold${hidden ? " hidden sm:table-cell" : ""} ${align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left"}`}
                    style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2, width, minWidth, transition: HISTORY_CELL_TRANSITION }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((group, index) => {
                const rawSeparationHint = getHistorySeparationHint(
                  index > 0 ? getGroupPrimaryLog(groups[index - 1]) : null,
                  getGroupPrimaryLog(group),
                );
                const separationHint = rawSeparationHint === "다른 요청" || rawSeparationHint === "별도 시각"
                  ? null
                  : rawSeparationHint;
                if (group.type === "solo") {
                  return (
                    <HistoryLogRow
                      key={group.log.log_id}
                      log={group.log}
                      selected={selectedLogId === group.log.log_id}
                      onSelect={onSelectLog}
                      separationHint={separationHint}
                    />
                  );
                }

                if (group.type === "defect_lifecycle") {
                  const expanded = expandedGroupKey === group.key;
                  const controlsId = historyGroupPanelId(group.key);
                  const selected = selectedLogId === group.parent.log_id || selectedLogId === group.child.log_id;
                  return (
                    <Fragment key={group.key}>
                      <HistoryLogRow
                        log={group.parent}
                        selected={selected}
                        onSelect={onSelectLog}
                        expanded={expanded}
                        onToggle={() => toggleGroup(group.key)}
                        controlsId={controlsId}
                        separationHint={separationHint}
                      />
                      {expanded && (
                        <ReferenceBatchDetail
                          logs={[group.child]}
                          highlightLogId={selectedLogId}
                          onSelectLog={onSelectChildLog ?? onSelectLog}
                          controlsId={controlsId}
                        />
                      )}
                    </Fragment>
                  );
                }

                if (group.type === "op_batch") {
                  const expanded = expandedGroupKey === group.batchId;
                  const controlsId = historyGroupPanelId(group.batchId);
                  const batch = batchCache.get(group.batchId) ?? null;
                  const isSelected = selectedBatchId === group.batchId;
                  const focusItemId = focusTarget?.groupKey === group.batchId ? focusTarget.itemId ?? null : null;
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
                        controlsId={controlsId}
                        separationHint={separationHint}
                      />
                      {expanded && (
                        <BomBatchDetail
                          batchId={group.batchId}
                          colSpan={COLUMNS.length}
                          cache={batchCache}
                          onCached={handleCacheBatch}
                          highlightItemId={focusItemId}
                          controlsId={controlsId}
                        />
                      )}
                    </Fragment>
                  );
                }

                // type === "batch" (reference_no 기준 레거시 그룹)
                // 재작업(defect-disassemble) 배치 → 트리 뷰
                const groupKey = group.refKey;
                if (group.refNo.startsWith("defect-disassemble:")) {
                  const expanded = expandedGroupKey === groupKey;
                  const controlsId = historyGroupPanelId(groupKey);
                  const parentLog = group.logs.find((l) => l.transaction_type === "DISASSEMBLE") ?? group.logs[0];
                  const childLogs = group.logs.filter((l) => l.transaction_type !== "DISASSEMBLE");
                  const isSelected = selectedLogId === group.logs[0]?.log_id;
                  return (
                    <Fragment key={`ref-${groupKey}`}>
                      <ReworkBatchHeader
                        group={group}
                        expanded={expanded}
                        onToggle={() => toggleGroup(groupKey)}
                        selected={isSelected}
                        onSelect={() => {
                          onSelectLog(group.logs[0]);
                          if (isSelected && expanded) collapseGroup(groupKey);
                          else expandGroup(groupKey);
                        }}
                        controlsId={controlsId}
                      />
                      {expanded && (
                        <ReworkBatchDetail
                          logs={childLogs}
                          parentItemId={parentLog.item_id}
                          colSpan={COLUMNS.length}
                          controlsId={controlsId}
                          cancelled={group.logs.some((log) => log.cancelled)}
                        />
                      )}
                    </Fragment>
                  );
                }

                // op_batch 가 아니라 IoBatch 가 없으므로 클릭 시 첫 로그 상세를 연다.
                const expanded = expandedGroupKey === groupKey;
                const controlsId = historyGroupPanelId(groupKey);
                const isSelected = selectedLogId === group.logs[0]?.log_id;
                const focusLogId = focusTarget?.groupKey === groupKey ? focusTarget.logId ?? null : null;
                return (
                  <Fragment key={`ref-${groupKey}`}>
                    <BatchHeader
                      group={group}
                      expanded={expanded}
                      onToggle={() => toggleGroup(groupKey)}
                      selected={isSelected}
                      onSelect={() => {
                        onSelectLog(group.logs[0]);
                        if (isSelected && expanded) collapseGroup(groupKey);
                        else expandGroup(groupKey);
                      }}
                      controlsId={controlsId}
                      separationHint={separationHint}
                      referenceSummary={referenceSummaries?.get(group.refKey) ?? null}
                      referenceSummaryLoading={referenceSummariesLoading}
                    />
                    {expanded && (
                      <ReferenceBatchDetail
                        logs={group.logs}
                        highlightLogId={focusLogId}
                        onSelectLog={onSelectChildLog ?? onSelectLog}
                        controlsId={controlsId}
                      />
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && groups.length > 0 && loadMoreError && (
        <div className="mt-4">
          <LoadFailureCard
            message={loadMoreError}
            onRetry={onLoadMore}
            retryLabel="다시 시도"
            prefix="다음 내역을 불러오지 못했습니다"
          />
        </div>
      )}

      {!error && !loadMoreError && canLoadMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
          className="mt-4 flex w-full items-center justify-center gap-2 py-3 text-base font-bold disabled:opacity-50"
          style={{ color: LEGACY_COLORS.blue }}
        >
          <ChevronDown className="h-4 w-4" />
          {loadingMore ? "불러오는 중..." : "다음 100건 불러오기"}
        </button>
      )}
    </div>
  );
}
