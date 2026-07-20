"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, type TransactionLog } from "@/lib/api";
import type { IoBatch } from "@/lib/api/types/io";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { HistoryFilterBar } from "./_history_sections/HistoryFilterBar";
import { HistoryFilterPanel } from "./_history_sections/HistoryFilterPanel";
import { HistoryCalendarPanel } from "./_history_sections/HistoryCalendarPanel";
import { HistoryStatsBar } from "./_history_sections/HistoryStatsBar";
import { HistoryTable } from "./_history_sections/HistoryTable";
import type { HistoryTableFocusTarget } from "./_history_sections/HistoryTable";
import { DesktopHistoryRightPanel } from "./_history_sections/DesktopHistoryRightPanel";
import { useDesktopHistoryGroups } from "./_hooks/useDesktopHistoryGroups";
import { useToggleSet } from "./_hooks/useToggleSet";
import { useMonthlyCountsQuery, useTransactionReferenceSummariesQuery, useTransactionsSummaryQuery } from "@/lib/queries/useTransactionsQuery";
import { useModelsQuery } from "@/lib/queries/useModelsQuery";
import { queryKeys } from "@/lib/queries/keys";
import { parseUtc, toDateKey } from "./_history_sections/historyFormat";
import { type HistorySelection } from "./_history_sections/historyConstants";
import { DATE_OPTIONS, dateFilterToFrom } from "./_history_sections/historyQuery";
import {
  advanceHistoryLoadReconcileState,
  applyHistoryCancellation,
  reconcileHistorySelection,
  type HistoryLoadReconcileState,
} from "./_history_sections/historyCancellation";
import { toHistoryLogGroups } from "./_history_sections/historyTableHelpers";

const SEARCH_DEBOUNCE_MS = 350;

export function DesktopHistoryView() {
  const queryClient = useQueryClient();
  // 3차: 상단 KPI 박스는 표시 전용(클릭 필터 폐기). 필터는 "필터" 패널 단일.
  // scope/typeFilter/activeBucket·부서 전개 상태 없음 — 항상 "전체"로 시작.
  // 대시보드식 독립 필터 패널 (부서·모델·거래종류 다중 선택).
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const { data: productModels } = useModelsQuery();
  const { selected: selectedModels, toggle: toggleModel, setSelected: setSelectedModels } = useToggleSet();
  const { selected: selectedDepts, toggle: toggleDept, setSelected: setSelectedDepts } = useToggleSet();
  const { selected: selectedOps, toggle: toggleOp, setSelected: setSelectedOps } = useToggleSet();
  const modelParam = selectedModels.join(",");
  const deptParam = selectedDepts.join(",");
  const opParam = selectedOps.join(",");
  const [dateFilter, setDateFilter] = useState("MONTH");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // search debounce — 목록과 달력 fetch 가 같은 값을 공유.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  // 필터 패널 "모델 구분" 칩 소스 — useModelsQuery 캐시에서 모델명만 추려 dedup.
  const availableModels = useMemo(
    () =>
      Array.from(
        new Set((productModels ?? []).map((m) => m.model_name).filter((n): n is string => !!n)),
      ),
    [productModels],
  );

  const [selection, setSelection] = useState<HistorySelection | null>(null);
  const [focusTarget, setFocusTarget] = useState<HistoryTableFocusTarget | null>(null);
  const [collapseRequestNonce, setCollapseRequestNonce] = useState(0);
  // 우측 패널 내 드릴(BOM 세부) 뒤로가기 스택. 표 행 클릭은 top-level 이라 스택 비움.
  const [selectionStack, setSelectionStack] = useState<HistorySelection[]>([]);

  // batchCache — HistoryTable 의 visible lazy fetch + 우측 batch 상세 패널이 공유.
  // 탭이 언마운트되어도 같은 QueryClient 안에서는 최종 의미 라벨을 즉시 복원한다.
  const [batchCache, setBatchCacheState] = useState<Map<string, IoBatch>>(
    () => queryClient.getQueryData<Map<string, IoBatch>>(queryKeys.transactions.batchCache()) ?? new Map(),
  );
  const batchCacheRef = useRef(batchCache);
  batchCacheRef.current = batchCache;
  const setBatchCache = useCallback<React.Dispatch<React.SetStateAction<Map<string, IoBatch>>>>((update) => {
    const next = typeof update === "function" ? update(batchCacheRef.current) : update;
    batchCacheRef.current = next;
    queryClient.setQueryData(queryKeys.transactions.batchCache(), next);
    setBatchCacheState(next);
  }, [queryClient]);

  // 달력 — 상단 접이식 패널. 기본 접힘. 펼쳤을 때만 월간 fetch.
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarLogs, setCalendarLogs] = useState<TransactionLog[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const now = new Date();
  const [calendarYear, setCalendarYear] = useState(now.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const lastSelectionRef = useRef<HistorySelection | null>(null);
  // 13-2번: navigateToLog 가 다른 날짜로 이동했을 때 그 거래 행을 리스트에서 찾아 scrollIntoView.
  const pendingScrollLogIdRef = useRef<string | null>(null);

  const periodLabel = selectedDay
    ? selectedDay
    : (DATE_OPTIONS.find((o) => o.value === dateFilter)?.label ?? "전체");

  const historyFilterParams = useMemo(() => ({
    operationKeys: opParam || undefined,
    dateFrom: selectedDay ?? dateFilterToFrom(dateFilter),
    dateTo: selectedDay ?? undefined,
    search: debouncedSearch.trim() || undefined,
    department: deptParam || undefined,
    model: modelParam || undefined,
  }), [dateFilter, debouncedSearch, deptParam, modelParam, opParam, selectedDay]);
  const baselineSummaryParams = useMemo(() => ({
    dateFrom: selectedDay ?? dateFilterToFrom(dateFilter),
    dateTo: selectedDay ?? undefined,
  }), [dateFilter, selectedDay]);
  const {
    data: summary = null,
    isLoading: summaryLoading,
    refetch: refetchSummary,
  } = useTransactionsSummaryQuery(historyFilterParams);
  const {
    data: baselineSummary = null,
    isLoading: baselineLoading,
    refetch: refetchBaselineSummary,
  } = useTransactionsSummaryQuery(baselineSummaryParams);
  const {
    data: referenceSummaryRows,
    isLoading: referenceSummariesLoading,
    refetch: refetchReferenceSummaries,
  } = useTransactionReferenceSummariesQuery(historyFilterParams);
  const referenceSummaries = useMemo(
    () => new Map((referenceSummaryRows ?? []).map((row) => [
      `${row.referenceNo}::${row.shippingPhase ?? ""}`,
      row,
    ])),
    [referenceSummaryRows],
  );

  const historyData = useDesktopHistoryGroups({
    operations: opParam,
    dateFilter,
    debouncedSearch,
    selectedDateKey: selectedDay,
    department: deptParam,
    model: modelParam,
  });
  const {
    groups: serverGroups,
    setGroups,
    loading,
    error: historyError,
    retry,
    loadingMore,
    loadMoreError,
    canLoadMore,
    loadMore,
  } = historyData;
  const logs = useMemo(() => serverGroups.flatMap((group) => group.logs), [serverGroups]);
  const displayGroups = useMemo(() => toHistoryLogGroups(serverGroups), [serverGroups]);
  const loadReconcileRef = useRef<HistoryLoadReconcileState>({
    wasLoading: loading,
    loadingLogs: loading ? logs : null,
  });

  // 달력 fetch — 패널이 펼쳐진 동안에만. 위 필터(거래종류·부서·모델·검색)와
  // 무관하게 그 달 전체 거래를 표시 (2차 #4). 보는 "달"만 따라감. 선택 날짜는 조건 아님.
  useEffect(() => {
    if (!calendarOpen) return;

    setCalendarLoading(true);
    const firstDay = new Date(calendarYear, calendarMonth, 1);
    const lastDay = new Date(calendarYear, calendarMonth + 1, 0);
    const ymd = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const ctrl = new AbortController();
    void api
      .getTransactions(
        {
          limit: 2000,
          skip: 0,
          dateFrom: ymd(firstDay),
          dateTo: ymd(lastDay),
        },
        { signal: ctrl.signal },
      )
      .then((data) => {
        setCalendarLogs(data);
        setCalendarLoading(false);
      })
      .catch((err) => {
        if ((err as Error)?.name !== "AbortError") setCalendarLoading(false);
      });
    return () => ctrl.abort();
  }, [calendarOpen, calendarYear, calendarMonth]);

  function prevMonth() {
    if (calendarMonth === 0) {
      setCalendarYear((y) => y - 1);
      setCalendarMonth(11);
    } else setCalendarMonth((m) => m - 1);
  }
  function nextMonth() {
    if (calendarMonth === 11) {
      setCalendarYear((y) => y + 1);
      setCalendarMonth(0);
    } else setCalendarMonth((m) => m + 1);
  }

  // 연 뷰(iOS 캘린더 스타일 줌) — 그 해 12개월 거래 건수 집계.
  // /monthly-counts?year=YYYY 신 endpoint — limit 제한 없이 집계값만 반환.
  const { data: monthlyCountsRaw } = useMonthlyCountsQuery(calendarYear);
  const monthlyCountMap = useMemo(() => {
    const m = new Map<number, number>();
    if (!monthlyCountsRaw) return m;
    for (const [key, count] of Object.entries(monthlyCountsRaw)) {
      // key 형식: "2026-01" → month index 0
      const month = parseInt(key.split("-")[1], 10) - 1;
      if (count > 0) m.set(month, count);
    }
    return m;
  }, [monthlyCountsRaw]);

  const calendarDayMap = useMemo(() => {
    const map = new Map<string, TransactionLog[]>();
    for (const log of calendarLogs) {
      const key = toDateKey(log.created_at);
      const d = parseUtc(log.created_at);
      if (d.getFullYear() !== calendarYear || d.getMonth() !== calendarMonth) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(log);
    }
    return map;
  }, [calendarLogs, calendarYear, calendarMonth]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calendarYear, calendarMonth]);

  const todayKey = toDateKey(new Date().toISOString());

  function pushHistoryStep() {
    if (typeof window === "undefined") return;
    window.history.pushState(null, "");
  }

  function retryHistoryResults() {
    retry();
    void refetchSummary();
    void refetchBaselineSummary();
    void refetchReferenceSummaries();
  }

  // 13-2번: 다른 날짜로 navigate 후 logs 가 로드되면 해당 거래 행으로 스크롤.
  useEffect(() => {
    const targetId = pendingScrollLogIdRef.current;
    if (!targetId) return;
    if (loading) return;
    if (!logs.some((l) => l.log_id === targetId)) return;
    const el = document.querySelector(`[data-log-id="${targetId}"]`) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      pendingScrollLogIdRef.current = null;
    }
  }, [logs, loading]);

  useEffect(() => {
    const decision = advanceHistoryLoadReconcileState(loadReconcileRef.current, {
      loading,
      error: historyError,
      logs,
    });
    loadReconcileRef.current = decision.state;
    if (!decision.shouldReconcile || !selection) return;

    const nextSelection = reconcileHistorySelection(selection, logs);
    setSelection(nextSelection);
    if (!nextSelection) {
      setSelectionStack([]);
      setFocusTarget(null);
      pendingScrollLogIdRef.current = null;
    }
  }, [historyError, loading, logs, selection]);

  function applyCancellationUpdate(updated: TransactionLog, batchId?: string | null) {
    setGroups((currentGroups) => currentGroups.map((group) => ({
      ...group,
      logs: applyHistoryCancellation(
        { logs: group.logs, selection: null, batchCache: new Map() },
        updated,
        batchId,
      ).logs,
    })));
    setSelection((currentSelection) => applyHistoryCancellation(
      { logs: [], selection: currentSelection, batchCache: new Map() },
      updated,
      batchId,
    ).selection);
    setBatchCache((currentBatchCache) => applyHistoryCancellation(
      { logs: [], selection: null, batchCache: currentBatchCache },
      updated,
      batchId,
    ).batchCache);
    setSelectionStack((stack) =>
      stack.flatMap((entry) => {
        const patched = applyHistoryCancellation(
          { logs: [], selection: entry, batchCache: new Map() },
          updated,
          batchId,
        ).selection;
        return patched ? [patched] : [];
      }),
    );
    void queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all });
  }

  function handleLogUpdated(updated: TransactionLog) {
    if (updated.cancelled) {
      applyCancellationUpdate(updated, updated.operation_batch_id);
      return;
    }
    setGroups((currentGroups) => currentGroups.map((group) => ({
      ...group,
      logs: group.logs.map((log) => (log.log_id === updated.log_id ? updated : log)),
    })));
    setSelection((current) =>
      current?.kind === "log" && current.log.log_id === updated.log_id
        ? { ...current, log: updated }
        : { kind: "log", log: updated },
    );
    void queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all });
  }

  function handleBatchCancelled(batchId: string, updated: TransactionLog) {
    applyCancellationUpdate(updated, batchId);
  }

  // 표 행 클릭(top-level) — 드릴 스택 초기화.
  function handleSelectLog(log: TransactionLog) {
    const opening = !(selection?.kind === "log" && selection.log.log_id === log.log_id);
    if (opening) pushHistoryStep();
    setSelectionStack([]);
    setSelection((c) =>
      c?.kind === "log" && c.log.log_id === log.log_id ? null : { kind: "log", log },
    );
  }

  function handleSelectBatch(batchId: string, logs: TransactionLog[]) {
    // 같은 묶음 재클릭 → 우측 패널 닫기 (단일 행 토글과 일관). HistoryTable 에서
    // 펼침 상태도 collapseGroup 으로 동시에 닫음 (selection 닫힘과 BOM 접힘 동기화).
    const opening = !(selection?.kind === "batch" && selection.batchId === batchId);
    if (opening) pushHistoryStep();
    setSelectionStack([]);
    setSelection((c) =>
      c?.kind === "batch" && c.batchId === batchId ? null : { kind: "batch", batchId, logs },
    );
  }

  // 우측 패널 내부 드릴(BOM 세부 라인·이 품목 최근 거래) — 현재 선택을 스택에 쌓고 이동.
  // 13-2번: 클릭한 로그가 다른 날짜에 속하면 selectedDay 를 그 날짜로 자동 조정해서
  // 리스트가 해당 거래를 포함하게 한 뒤, 효과(useEffect 으로 logs 로드 완료 시점에)
  // 로 그 행으로 scrollIntoView.
  function navigateToLog(log: TransactionLog) {
    const logYmd = toDateKey(log.created_at);
    const logAlreadyInList = logs.some((entry) => entry.log_id === log.log_id);
    if (!logAlreadyInList && logYmd && logYmd !== selectedDay) {
      setSelectedDay(logYmd);
    }
    pendingScrollLogIdRef.current = log.log_id;
    if (!selection) pushHistoryStep();
    setSelection((cur) => {
      if (cur && !(cur.kind === "log" && cur.log.log_id === log.log_id)) {
        setSelectionStack((s) => [...s, cur]);
        if (typeof window !== "undefined") {
          window.history.pushState(null, "");
        }
      }
      return { kind: "log", log };
    });
  }

  function handleSelectChildLog(log: TransactionLog) {
    const opening = !(selection?.kind === "log" && selection.log.log_id === log.log_id && selection.allowCancellation === false);
    if (opening) pushHistoryStep();
    setSelectionStack([]);
    setSelection((current) =>
      current?.kind === "log" && current.log.log_id === log.log_id && current.allowCancellation === false
        ? null
        : { kind: "log", log, allowCancellation: false },
    );
  }

  function focusHistoryLineInList(target: Omit<HistoryTableFocusTarget, "nonce">) {
    setFocusTarget({ ...target, nonce: Date.now() });
  }

  // 한 단계 뒤로 — 스택 pop. 비면 무시(패널 유지).
  function goBack() {
    setSelectionStack((s) => {
      if (s.length === 0) return s;
      const prev = s[s.length - 1];
      setSelection(prev);
      return s.slice(0, -1);
    });
  }

  function handleCalendarSelectedDay(next: string | null) {
    if (next && next !== selectedDay) pushHistoryStep();
    setSelectedDay(next);
  }

  // 브라우저 뒤로가기 → 화면 단계(드릴/날짜/상세/달력/필터)를 최신 순서로 닫는다.
  useEffect(() => {
    const onPop = () => {
      if (selectionStack.length > 0) {
        const prev = selectionStack[selectionStack.length - 1];
        setSelection(prev);
        setSelectionStack((stack) => stack.slice(0, -1));
        return;
      }
      if (selection) {
        setSelectionStack([]);
        setSelection(null);
        return;
      }
      if (selectedDay) {
        setSelectedDay(null);
        return;
      }
      if (calendarOpen) {
        setCalendarOpen(false);
        return;
      }
      if (filterPanelOpen) {
        setFilterPanelOpen(false);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [calendarOpen, filterPanelOpen, selectedDay, selection, selectionStack]);

  // 기간 칩 변경 시 선택 날짜 해제 — 동시에 두 날짜 필터가 살아있으면 사용자가 혼란.
  function handleDateFilterChange(v: string) {
    setDateFilter(v);
    setSelectedDay(null);
  }

  if (selection) lastSelectionRef.current = selection;
  const displaySelection = selection ?? lastSelectionRef.current;

  const activeFilterCount = selectedDepts.length + selectedModels.length + selectedOps.length;

  return (
    <div className="flex min-h-0 flex-1 min-w-0 pl-0 lg:pr-4">
      {/* ── 좌측: 스크롤 영역 ── */}
      <div
      className="sg min-h-0 min-w-0 flex-1 overflow-y-auto rounded-[28px] border"
        style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.bg }}
      >
        <div className="flex flex-col gap-3 pb-6">
          <HistoryStatsBar
            baseline={baselineSummary}
            currentCount={summary?.total ?? null}
            loading={summaryLoading || baselineLoading}
            loadingDisplay="skeleton"
            periodLabel={periodLabel}
          />

          <HistoryFilterBar
            search={search}
            setSearch={setSearch}
            dateFilter={dateFilter}
            setDateFilter={handleDateFilterChange}
            filterPanelOpen={filterPanelOpen}
            onToggleFilterPanel={() => {
              setFilterPanelOpen((open) => {
                const next = !open;
                if (next) {
                  pushHistoryStep();
                  setCalendarOpen(false);
                }
                return next;
              });
            }}
            activeFilterCount={activeFilterCount}
            calendarOpen={calendarOpen}
            onToggleCalendar={() => {
              setCalendarOpen((open) => {
                const next = !open;
                if (next) {
                  pushHistoryStep();
                  setFilterPanelOpen(false);
                }
                return next;
              });
            }}
            selectedDay={selectedDay}
            onClearSelectedDay={() => setSelectedDay(null)}
          />

          {filterPanelOpen && (
            <section className="card" style={{ paddingTop: 12, paddingBottom: 12 }}>
              <HistoryFilterPanel
                open={filterPanelOpen}
                departmentCounts={baselineSummary?.departmentCounts ?? {}}
                selectedDepts={selectedDepts}
                toggleDept={toggleDept}
                clearDepts={() => setSelectedDepts([])}
                models={availableModels}
                selectedModels={selectedModels}
                toggleModel={toggleModel}
                clearModels={() => setSelectedModels([])}
                selectedOps={selectedOps}
                toggleOp={toggleOp}
                clearOps={() => setSelectedOps([])}
                onResetAll={() => {
                  setSelectedDepts([]);
                  setSelectedModels([]);
                  setSelectedOps([]);
                }}
              />
            </section>
          )}

          <HistoryCalendarPanel
            open={calendarOpen}
            calendarYear={calendarYear}
            calendarMonth={calendarMonth}
            prevMonth={prevMonth}
            nextMonth={nextMonth}
            setCalendarYear={setCalendarYear}
            setCalendarMonth={setCalendarMonth}
            calendarLoading={calendarLoading}
            calendarDays={calendarDays}
            calendarDayMap={calendarDayMap}
            monthlyCountMap={monthlyCountMap}
            todayKey={todayKey}
            selectedDay={selectedDay}
            setSelectedDay={handleCalendarSelectedDay}
          />

          <HistoryTable
            loading={loading}
            error={historyError}
            onRetry={retryHistoryResults}
            filteredLogs={logs}
            displayGroups={displayGroups}
            selection={selection}
            onSelectLog={handleSelectLog}
            onSelectChildLog={handleSelectChildLog}
            onSelectBatch={handleSelectBatch}
            batchCache={batchCache}
            setBatchCache={setBatchCache}
            canLoadMore={canLoadMore}
            loadingMore={loadingMore}
            loadMoreError={loadMoreError}
            onLoadMore={() => void loadMore()}
            focusTarget={focusTarget}
            referenceSummaries={referenceSummaries}
            referenceSummariesLoading={referenceSummariesLoading}
            collapseRequestNonce={collapseRequestNonce}
          />
        </div>
      </div>

      <DesktopHistoryRightPanel
        selection={selection}
        displaySelection={displaySelection}
        batchCache={batchCache}
        setBatchCache={setBatchCache}
        onSelectLog={navigateToLog}
        canGoBack={selectionStack.length > 0}
        onBack={goBack}
        onLogUpdated={handleLogUpdated}
        onBatchCancelled={handleBatchCancelled}
        onFocusLineInList={focusHistoryLineInList}
        onClose={() => {
          setSelectionStack([]);
          setSelection(null);
          setCollapseRequestNonce((nonce) => nonce + 1);
        }}
      />
    </div>
  );
}
