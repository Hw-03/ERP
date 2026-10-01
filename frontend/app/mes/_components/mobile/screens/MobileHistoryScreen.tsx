"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, type TransactionLog } from "@/lib/api";
import { productionApi, type TransactionSummary } from "@/lib/api/production";
import type { IoBatch } from "@/lib/api/types/io";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { BottomSheet } from "@/lib/ui/BottomSheet";
import { HistoryFilterBar } from "../../_history_sections/HistoryFilterBar";
import { HistoryFilterPanel } from "../../_history_sections/HistoryFilterPanel";
import { HistoryCalendarPanel } from "../../_history_sections/HistoryCalendarPanel";
import { HistoryStatsBar } from "../../_history_sections/HistoryStatsBar";
import { HistoryDetailPanel } from "../../_history_sections/HistoryDetailPanel";
import { HistoryBatchDetailPanel } from "../../_history_sections/HistoryBatchDetailPanel";
import { useHistoryGroups } from "../../_hooks/useHistoryGroups";
import { useToggleSet } from "../../_hooks/useToggleSet";
import { useMonthlyCountsQuery } from "@/lib/queries/useTransactionsQuery";
import { useModelsQuery } from "@/lib/queries/useModelsQuery";
import { invalidateOperationalQueries, useRealtimeRevision } from "@/lib/queries/realtime";
import { toDateKey, formatHistoryDate } from "../../_history_sections/historyFormat";
import { type HistorySelection } from "../../_history_sections/historyConstants";
import { resolveHistoryDateRange, type SelectedHistoryMonth } from "../../_history_sections/historyQuery";
import { getAdditionalDistinctItemCount, getHistoryGroupSummary, toHistoryLogGroups } from "../../_history_sections/historyTableHelpers";
import { queryKeys } from "@/lib/queries/keys";
import { MobileHistoryList } from "../history/MobileHistoryList";
import { MobileScrollFrame } from "../primitives/MobileScrollFrame";
import detailStyles from "../../_history_sections/HistoryMobileDetail.module.css";
import { ReadFailure } from "../../common/ReadState";
import {
  mergeHistoryLogUpdate,
  advanceHistoryLoadReconcileState,
  applyHistoryCancellation,
  reconcileHistorySelection,
  type HistoryLoadReconcileState,
} from "../../_history_sections/historyCancellation";

const SEARCH_DEBOUNCE_MS = 350;

function getCurrentKstCalendarMonth(): SelectedHistoryMonth {
  const key = toDateKey(new Date().toISOString());
  return { year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) - 1 };
}

/**
 * 입출고 내역 모바일 화면.
 *
 * DesktopHistoryView 의 state/훅 오케스트레이션을 그대로 따르되,
 * ① 와이드 HistoryTable → MobileHistoryList(카드) ② 우측 SlidePanel 상세
 * → 드래그 BottomSheet 로 교체. 데이터/포맷/그룹 순수함수(historyShared
 * golden)는 호출만.
 */
export function MobileHistoryScreen() {
  const queryClient = useQueryClient();
  const realtimeRevision = useRealtimeRevision();
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

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  const availableModels = useMemo(
    () =>
      Array.from(
        new Set((productModels ?? []).map((m) => m.model_name).filter((n): n is string => !!n)),
      ),
    [productModels],
  );

  const [selection, setSelection] = useState<HistorySelection | null>(null);
  const [selectionStack, setSelectionStack] = useState<HistorySelection[]>([]);
  const [batchCache, setBatchCacheState] = useState<Map<string, IoBatch>>(() => queryClient.getQueryData<Map<string, IoBatch>>(queryKeys.transactions.batchCache()) ?? new Map());

  const batchCacheRef = useRef(batchCache);
  batchCacheRef.current = batchCache;
  const setBatchCache = useCallback((update: React.SetStateAction<Map<string, IoBatch>>) => {
    const next = typeof update === "function" ? update(batchCacheRef.current) : update;
    batchCacheRef.current = next;
    queryClient.setQueryData(queryKeys.transactions.batchCache(), next);
    setBatchCacheState(next);
  }, [queryClient]);

  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarLogs, setCalendarLogs] = useState<TransactionLog[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const calendarLoadedKeyRef = useRef<string | null>(null);
  const [calendarCursor, setCalendarCursor] = useState<SelectedHistoryMonth>(getCurrentKstCalendarMonth);
  const calendarCursorRef = useRef(calendarCursor);
  calendarCursorRef.current = calendarCursor;
  const calendarYear = calendarCursor.year;
  const calendarMonth = calendarCursor.month;
  const setCalendarYear = useCallback((updater: (year: number) => number) => {
    const current = calendarCursorRef.current;
    const next = { ...current, year: updater(current.year) };
    calendarCursorRef.current = next;
    setCalendarCursor(next);
  }, []);
  const setCalendarMonth = useCallback((month: number) => {
    const next = { ...calendarCursorRef.current, month };
    calendarCursorRef.current = next;
    setCalendarCursor(next);
  }, []);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<SelectedHistoryMonth | null>(null);
  const lastSelectionRef = useRef<HistorySelection | null>(null);

  const selectedDateRange = useMemo(
    () => resolveHistoryDateRange(dateFilter, selectedDay, selectedMonth),
    [dateFilter, selectedDay, selectedMonth],
  );
  const periodLabel = selectedDateRange.periodLabel;

  const [summary, setSummary] = useState<TransactionSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryRetry, setSummaryRetry] = useState(0);
  const summaryKeyRef = useRef("");
  const summaryConditionsRef = useRef("");
  const summaryRef = useRef<TransactionSummary | null>(null);
  const summaryConditionsKey = JSON.stringify([
    opParam || null,
    selectedDateRange.dateFrom ?? null,
    selectedDateRange.dateTo ?? null,
    debouncedSearch.trim() || null,
    deptParam || null,
    modelParam || null,
  ]);
  const summaryChanged = summaryConditionsRef.current !== summaryConditionsKey;
  const currentSummary = summaryChanged ? null : summary;

  const historyData = useHistoryGroups({
    operations: opParam,
    dateFilter,
    debouncedSearch,
    selectedDateKey: selectedDay,
    selectedMonth,
    department: deptParam,
    model: modelParam,
    realtimeRevision,
  });
  const {
    groups: serverGroups,
    setGroups,
    loading,
    error: historyError,
    retry,
    refreshError,
    retryRefresh,
    loadingMore,
    loadMoreError,
    canLoadMore,
    loadMore,
    refreshLoaded,
  } = historyData;
  const logs = useMemo(() => serverGroups.flatMap((group) => group.logs), [serverGroups]);
  const displayGroups = useMemo(() => toHistoryLogGroups(serverGroups), [serverGroups]);
  const loadReconcileRef = useRef<HistoryLoadReconcileState>({
    wasLoading: loading,
    loadingLogs: loading ? logs : null,
  });

  useEffect(() => {
    if (!calendarOpen) return;
    const calendarKey = `${calendarYear}-${calendarMonth}`;
    const background = calendarLoadedKeyRef.current === calendarKey;
    if (!background) setCalendarLoading(true);
    const firstDay = new Date(calendarYear, calendarMonth, 1);
    const lastDay = new Date(calendarYear, calendarMonth + 1, 0);
    const ymd = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate(),
      ).padStart(2, "0")}`;
    const ctrl = new AbortController();
    let active = true;
    void api
      .getTransactions(
        { limit: 2000, skip: 0, dateFrom: ymd(firstDay), dateTo: ymd(lastDay) },
        { signal: ctrl.signal },
      )
      .then((data) => {
        if (!active) return;
        calendarLoadedKeyRef.current = calendarKey;
        setCalendarLogs(data);
        if (!background) setCalendarLoading(false);
      })
      .catch((err) => {
        if (active && !background && (err as Error)?.name !== "AbortError") setCalendarLoading(false);
      });
    return () => {
      active = false;
      ctrl.abort();
    };
  }, [calendarOpen, calendarYear, calendarMonth, realtimeRevision]);

  function prevMonth() {
    moveCalendarMonth(-1);
  }
  function nextMonth() {
    moveCalendarMonth(1);
  }

  // 연 뷰 — 그 해 12개월 거래 건수 집계.
  // /monthly-counts?year=YYYY 신 endpoint — limit 제한 없이 집계값만 반환.
  const { data: monthlyCountsRaw } = useMonthlyCountsQuery(calendarYear, { enabled: calendarOpen });
  const monthlyCountMap = useMemo(() => {
    const m = new Map<number, number>();
    if (!monthlyCountsRaw) return m;
    for (const [key, count] of Object.entries(monthlyCountsRaw)) {
      const month = parseInt(key.split("-")[1], 10) - 1;
      if (count > 0) m.set(month, count);
    }
    return m;
  }, [monthlyCountsRaw]);

  const calendarDayMap = useMemo(() => {
    const map = new Map<string, TransactionLog[]>();
    for (const log of calendarLogs) {
      const key = toDateKey(log.created_at);
      if (!key.startsWith(`${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-`)) continue;
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

  useEffect(() => {
    const operationKeys = opParam || undefined;
    const { dateFrom, dateTo } = selectedDateRange;
    const searchParam = debouncedSearch.trim() || undefined;
    const department = deptParam || undefined;
    const model = modelParam || undefined;
    const conditionsKey = JSON.stringify([
      operationKeys ?? null,
      dateFrom ?? null,
      dateTo ?? null,
      searchParam ?? null,
      department ?? null,
      model ?? null,
    ]);
    const myKey = JSON.stringify([conditionsKey, realtimeRevision ?? null]);
    const background = summaryConditionsRef.current === conditionsKey && summaryRef.current !== null;
    setSummaryError(null);
    summaryConditionsRef.current = conditionsKey;
    summaryKeyRef.current = myKey;
    if (!background) {
      summaryRef.current = null;
      setSummary(null);
      setSummaryLoading(true);
    }
    const ctrl = new AbortController();
    void productionApi
      .getTransactionsSummary(
        { operationKeys, dateFrom, dateTo, search: searchParam, department, model },
        { signal: ctrl.signal },
      )
      .then((s) => {
        if (summaryKeyRef.current !== myKey) return;
        summaryRef.current = s;
        setSummary(s);
        if (!background) setSummaryLoading(false);
      })
      .catch((err) => {
        if ((err as Error)?.name === "AbortError") return;
        if (summaryKeyRef.current !== myKey) return;
        setSummaryError("집계를 불러오지 못했습니다.");
        if (!background) {
          summaryRef.current = null;
          setSummary(null);
          setSummaryLoading(false);
        }
      });
    return () => ctrl.abort();
  }, [debouncedSearch, deptParam, modelParam, opParam, realtimeRevision, selectedDateRange, summaryRetry]);

  const [baselineSummary, setBaselineSummary] = useState<TransactionSummary | null>(null);
  const [baselineLoading, setBaselineLoading] = useState(false);
  const [baselineError, setBaselineError] = useState<string | null>(null);
  const baselineKeyRef = useRef("");
  const baselineConditionsRef = useRef("");
  const baselineSummaryRef = useRef<TransactionSummary | null>(null);
  const baselineConditionsKey = JSON.stringify([selectedDateRange.dateFrom ?? null, selectedDateRange.dateTo ?? null]);
  const baselineChanged = baselineConditionsRef.current !== baselineConditionsKey;
  const currentBaseline = baselineChanged ? null : baselineSummary;
  const currentSummaryError = summaryChanged ? null : summaryError;
  const currentBaselineError = baselineChanged ? null : baselineError;

  useEffect(() => {
    const { dateFrom, dateTo } = selectedDateRange;
    const conditionsKey = JSON.stringify([dateFrom ?? null, dateTo ?? null]);
    const myKey = JSON.stringify([conditionsKey, realtimeRevision ?? null]);
    const background = baselineConditionsRef.current === conditionsKey && baselineSummaryRef.current !== null;
    setBaselineError(null);
    baselineConditionsRef.current = conditionsKey;
    baselineKeyRef.current = myKey;
    if (!background) {
      baselineSummaryRef.current = null;
      setBaselineSummary(null);
      setBaselineLoading(true);
    }
    const ctrl = new AbortController();
    void productionApi
      .getTransactionsSummary({ dateFrom, dateTo }, { signal: ctrl.signal })
      .then((s) => {
        if (baselineKeyRef.current !== myKey) return;
        baselineSummaryRef.current = s;
        setBaselineSummary(s);
        if (!background) setBaselineLoading(false);
      })
      .catch((err) => {
        if ((err as Error)?.name === "AbortError") return;
        if (baselineKeyRef.current !== myKey) return;
        setBaselineError("집계를 불러오지 못했습니다.");
        if (!background) {
          baselineSummaryRef.current = null;
          setBaselineSummary(null);
          setBaselineLoading(false);
        }
      });
    return () => ctrl.abort();
  }, [realtimeRevision, selectedDateRange, summaryRetry]);

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
    if (!nextSelection) setSelectionStack([]);
  }, [historyError, loading, logs, selection]);

  function applyCancellationUpdate(updated: TransactionLog, batchId?: string | null) {
    setGroups((currentGroups) => currentGroups.map((group) => ({
      ...group,
      logs: applyHistoryCancellation(
        { logs: group.logs, selection: null, batchCache: new Map() }, updated, batchId,
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
    void invalidateOperationalQueries(queryClient);
    refreshLoaded();
  }

  function handleLogUpdated(updated: TransactionLog) {
    if (updated.cancelled) {
      applyCancellationUpdate(updated, updated.operation_batch_id);
      return;
    }
    setGroups((currentGroups) => currentGroups.map((group) => ({
      ...group, logs: group.logs.map((log) => log.log_id === updated.log_id ? mergeHistoryLogUpdate(log, updated) : log),
    })));
    void queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all });
    refreshLoaded();
    setSelection({ kind: "log", log: updated });
  }

  function handleBatchCancelled(batchId: string, updated: TransactionLog) {
    applyCancellationUpdate(updated, batchId);
  }

  function handleSelectLog(log: TransactionLog) {
    setSelectionStack([]);
    setSelection((c) =>
      c?.kind === "log" && c.log.log_id === log.log_id ? null : { kind: "log", log },
    );
  }

  function handleSelectBatch(batchId: string, batchLogs: TransactionLog[]) {
    const group = displayGroups.find((value) => value.type !== "solo" &&
      (value.type === "operation" ? value.operationId : value.type === "op_batch" ? value.batchId : value.type === "batch" ? value.refKey : value.key) === batchId);
    const primary = group ? getHistoryGroupSummary(group, group.type === "op_batch" ? batchCache.get(group.batchId) : undefined).primaryLog : batchLogs[0];
    const selectedLogs = primary ? [primary, ...batchLogs.filter((log) => log.log_id !== primary.log_id)] : batchLogs;
    setSelectionStack([]);
    setSelection((c) =>
      c?.kind === "batch" && c.batchId === batchId
        ? null
        : { kind: "batch", batchId, logs: selectedLogs, groupType: group?.type === "solo" ? undefined : group?.type },
    );
  }

  function navigateToLog(log: TransactionLog) {
    // 다른 날짜 거래로 이동하면 selectedDay 를 맞춰 리스트가 그 거래를 포함하게 한다
    // (데스크톱 동작 복제 — 393px 라 시트가 리스트를 덮어 scrollIntoView 는 생략).
    const logYmd = toDateKey(log.created_at);
    if (logYmd && logYmd !== selectedDay) {
      setSelectedDay(logYmd);
      setSelectedMonth(null);
    }
    setSelection((cur) => {
      if (cur && !(cur.kind === "log" && cur.log.log_id === log.log_id)) {
        setSelectionStack((s) => [...s, cur]);
      }
      return { kind: "log", log };
    });
  }

  function goBack() {
    setSelectionStack((s) => {
      if (s.length === 0) return s;
      const prev = s[s.length - 1];
      setSelection(prev);
      return s.slice(0, -1);
    });
  }

  // 하드웨어/브라우저 뒤로가기 → 드릴(BOM 하위·최근거래) 스택 한 단계 pop(데스크톱 복제).
  useEffect(() => {
    const onPop = () => {
      setSelectionStack((s) => {
        if (s.length === 0) return s;
        const prev = s[s.length - 1];
        setSelection(prev);
        return s.slice(0, -1);
      });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function handleDateFilterChange(v: string) {
    setDateFilter(v);
    setSelectedDay(null);
    setSelectedMonth(null);
  }

  function handleCalendarSelectedDay(next: string | null) {
    if (next) setSelectedMonth(null);
    setSelectedDay(next);
  }

  function selectCalendarMonth(month: SelectedHistoryMonth) {
    calendarCursorRef.current = month;
    setCalendarCursor(month);
    setSelectedDay(null);
    setSelectedMonth(month);
  }

  function moveCalendarMonth(offset: number) {
    const current = calendarCursorRef.current;
    const absoluteMonth = current.year * 12 + current.month + offset;
    const month = ((absoluteMonth % 12) + 12) % 12;
    const next = { year: (absoluteMonth - month) / 12, month };
    calendarCursorRef.current = next;
    setCalendarCursor(next);
    setSelectedDay(null);
    setSelectedMonth(next);
  }

  function closeSheet() {
    setSelectionStack([]);
    setSelection(null);
  }

  if (selection) lastSelectionRef.current = selection;
  const displaySelection = selection ?? lastSelectionRef.current;
  const activeFilterCount =
    selectedDepts.length + selectedModels.length + selectedOps.length;

  const selectedKey =
    selection?.kind === "log"
      ? `log:${selection.log.log_id}`
      : selection?.kind === "batch"
      ? `batch:${selection.batchId}`
      : null;

  const additionalItemCount = displaySelection?.kind === "batch"
    ? getAdditionalDistinctItemCount(displaySelection.logs, displaySelection.logs[0] ?? null) : 0;

  const sheetTitle =
    displaySelection?.kind === "log"
      ? displaySelection.log.item_name
      : displaySelection?.kind === "batch"
      ? `${displaySelection.logs[0]?.item_name ?? "묶음"}${
          additionalItemCount > 0
            ? ` 외 ${additionalItemCount}건`
            : ""
        }`
      : "내역 상세";
  const sheetSubtitle =
    displaySelection?.kind === "log"
      ? `${displaySelection.log.mes_code ?? "-"} · ${formatHistoryDate(
          displaySelection.log.created_at,
        )}`
      : displaySelection?.kind === "batch" ? displaySelection.logs[0]?.mes_code ?? "" : "";

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" style={{ background: LEGACY_COLORS.bg }}>
      <MobileScrollFrame roundTop>
        <div className="mhf flex flex-col gap-2">
          <HistoryStatsBar
            mobile
            baseline={currentBaseline}
            currentSummary={currentSummary}
            currentCount={currentSummary?.total ?? null}
            loading={summaryChanged || baselineChanged || summaryLoading || baselineLoading}
            hasListFilters={activeFilterCount > 0 || !!debouncedSearch.trim()}
            periodLabel={periodLabel}
          />

          {(currentSummaryError || currentBaselineError) && <ReadFailure message={currentSummaryError ?? currentBaselineError!}
            refresh={currentSummary !== null || currentBaseline !== null} onRetry={() => setSummaryRetry((value) => value + 1)} />}

          <HistoryFilterBar
            mobile
            search={search}
            setSearch={setSearch}
            dateFilter={dateFilter}
            setDateFilter={handleDateFilterChange}
            filterPanelOpen={filterPanelOpen}
            onToggleFilterPanel={() => setFilterPanelOpen((o) => !o)}
            activeFilterCount={activeFilterCount}
            calendarOpen={calendarOpen}
            onToggleCalendar={() => setCalendarOpen((o) => !o)}
            selectedDay={selectedDay}
            onClearSelectedDay={() => setSelectedDay(null)}
            selectedMonth={selectedMonth}
            onClearSelectedMonth={() => setSelectedMonth(null)}
          />

          {filterPanelOpen && (
            <section className="card" style={{ paddingTop: 12, paddingBottom: 12 }}>
              <HistoryFilterPanel
                open={filterPanelOpen}
                departmentCounts={currentBaseline?.departmentCounts ?? {}}
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
            onSelectMonth={selectCalendarMonth}
            calendarLoading={calendarLoading}
            calendarDays={calendarDays}
            calendarDayMap={calendarDayMap}
            monthlyCountMap={monthlyCountMap}
            todayKey={todayKey}
            selectedDay={selectedDay}
            setSelectedDay={handleCalendarSelectedDay}
            hideWeekends
          />

          <MobileHistoryList
            loading={loading}
            hasSearch={!!search.trim()}
            hasFilters={selectedDepts.length > 0 || selectedModels.length > 0 || selectedOps.length > 0 || dateFilter !== "MONTH" || !!selectedDay || !!selectedMonth}
            onResetFilters={() => {
              setSearch(""); setSelectedDepts([]); setSelectedModels([]); setSelectedOps([]);
              setDateFilter("MONTH"); setSelectedDay(null); setSelectedMonth(null);
            }}
            error={historyError}
            refreshError={refreshError}
            displayGroups={displayGroups}
            batchCache={batchCache}
            setBatchCache={setBatchCache}
            cacheEpoch={realtimeRevision}
            loadMoreError={loadMoreError}
            selectedKey={selectedKey}
            onSelectLog={handleSelectLog}
            onSelectBatch={handleSelectBatch}
            onRetry={() => void retry()}
            onRetryRefresh={retryRefresh}
            canLoadMore={canLoadMore}
            loadingMore={loadingMore}
            onLoadMore={() => void loadMore()}
          />
        </div>
      </MobileScrollFrame>

      <BottomSheet open={!!selection} onClose={closeSheet} ariaLabel={`${sheetTitle} 상세`}>
        {displaySelection && (
          <div className={`px-5 ${detailStyles.detail}`}>
            <div className="mb-3">
              {selectionStack.length > 0 && (
                <button
                  type="button"
                  onClick={goBack}
                  className="mb-2 inline-flex min-h-[44px] items-center gap-1 rounded-[12px] border px-3 py-1.5 text-xs font-bold"
                  style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.blue }}
                >
                  ← 뒤로
                </button>
              )}
              <div className="break-words text-lg font-bold leading-snug" style={{ color: LEGACY_COLORS.text }}>
                {sheetTitle}
              </div>
              {sheetSubtitle && <div
                className="mt-1 break-words text-xs leading-5"
                style={{ color: LEGACY_COLORS.muted2 }}
              >
                {sheetSubtitle}
              </div>}
            </div>

            {displaySelection.kind === "log" && (
              <HistoryDetailPanel
                mobilePresentation
                panelOpen={!!selection}
                selected={displaySelection.log}
                onSelectLog={navigateToLog}
                onLogUpdated={handleLogUpdated}
              />
            )}
            {displaySelection.kind === "batch" && (
              <HistoryBatchDetailPanel
                mobilePresentation
                panelOpen={!!selection}
                batchId={displaySelection.batchId}
                logs={displaySelection.logs}
                batchCache={batchCache}
                setBatchCache={setBatchCache}
                onSelectLog={navigateToLog}
                onBatchCancelled={handleBatchCancelled}
              />
            )}
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
