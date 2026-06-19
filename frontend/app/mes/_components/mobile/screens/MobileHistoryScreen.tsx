"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { useHistoryData } from "../../_hooks/useHistoryData";
import { useToggleSet } from "../../_hooks/useToggleSet";
import { useMonthlyCountsQuery } from "@/lib/queries/useTransactionsQuery";
import { useModelsQuery } from "@/lib/queries/useModelsQuery";
import { parseUtc, toDateKey, formatHistoryDate } from "../../_history_sections/historyFormat";
import {
  getHistoryActor,
  getHistoryDisplayLabel,
} from "../../_history_sections/historyBatchInterpreter";
import { type HistorySelection } from "../../_history_sections/historyConstants";
import { DATE_OPTIONS, dateFilterToFrom } from "../../_history_sections/historyQuery";
import { MobileHistoryList } from "../history/MobileHistoryList";

const SEARCH_DEBOUNCE_MS = 350;

/**
 * 입출고 내역 모바일 화면.
 *
 * DesktopHistoryView 의 state/훅 오케스트레이션을 그대로 따르되,
 * ① 와이드 HistoryTable → MobileHistoryList(카드) ② 우측 SlidePanel 상세
 * → 드래그 BottomSheet 로 교체. 데이터/포맷/그룹 순수함수(historyShared
 * golden)는 호출만.
 */
export function MobileHistoryScreen() {
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
  const [batchCache, setBatchCache] = useState<Map<string, IoBatch>>(new Map());

  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarLogs, setCalendarLogs] = useState<TransactionLog[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const now = new Date();
  const [calendarYear, setCalendarYear] = useState(now.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const lastSelectionRef = useRef<HistorySelection | null>(null);

  const periodLabel = selectedDay
    ? selectedDay
    : DATE_OPTIONS.find((o) => o.value === dateFilter)?.label ?? "전체";

  const { logs, setLogs, loading, loadingMore, canLoadMore, loadMore } = useHistoryData({
    operations: opParam,
    dateFilter,
    debouncedSearch,
    selectedDateKey: selectedDay,
    department: deptParam,
    model: modelParam,
  });

  useEffect(() => {
    if (!calendarOpen) return;
    setCalendarLoading(true);
    const firstDay = new Date(calendarYear, calendarMonth, 1);
    const lastDay = new Date(calendarYear, calendarMonth + 1, 0);
    const ymd = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate(),
      ).padStart(2, "0")}`;
    const ctrl = new AbortController();
    void api
      .getTransactions(
        { limit: 2000, skip: 0, dateFrom: ymd(firstDay), dateTo: ymd(lastDay) },
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

  // 연 뷰 — 그 해 12개월 거래 건수 집계.
  // /monthly-counts?year=YYYY 신 endpoint — limit 제한 없이 집계값만 반환.
  const { data: monthlyCountsRaw } = useMonthlyCountsQuery(calendarYear);
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

  const [summary, setSummary] = useState<TransactionSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const summaryKeyRef = useRef("");

  useEffect(() => {
    const transactionTypes = opParam || undefined;
    const dateFrom = selectedDay ?? dateFilterToFrom(dateFilter);
    const dateTo = selectedDay ?? undefined;
    const searchParam = debouncedSearch.trim() || undefined;
    const department = deptParam || undefined;
    const model = modelParam || undefined;
    const myKey = `${transactionTypes ?? ""}|${dateFrom ?? ""}|${dateTo ?? ""}|${searchParam ?? ""}|${department ?? ""}|${model ?? ""}`;
    summaryKeyRef.current = myKey;
    setSummaryLoading(true);
    const ctrl = new AbortController();
    void productionApi
      .getTransactionsSummary(
        { transactionTypes, dateFrom, dateTo, search: searchParam, department, model },
        { signal: ctrl.signal },
      )
      .then((s) => {
        if (summaryKeyRef.current !== myKey) return;
        setSummary(s);
        setSummaryLoading(false);
      })
      .catch((err) => {
        if ((err as Error)?.name === "AbortError") return;
        if (summaryKeyRef.current !== myKey) return;
        setSummaryLoading(false);
      });
    return () => ctrl.abort();
  }, [dateFilter, selectedDay, debouncedSearch, deptParam, modelParam, opParam]);

  const [baselineSummary, setBaselineSummary] = useState<TransactionSummary | null>(null);
  const [baselineLoading, setBaselineLoading] = useState(false);
  const baselineKeyRef = useRef("");

  useEffect(() => {
    const dateFrom = selectedDay ?? dateFilterToFrom(dateFilter);
    const dateTo = selectedDay ?? undefined;
    const myKey = `${dateFrom ?? ""}|${dateTo ?? ""}`;
    baselineKeyRef.current = myKey;
    setBaselineLoading(true);
    const ctrl = new AbortController();
    void productionApi
      .getTransactionsSummary({ dateFrom, dateTo }, { signal: ctrl.signal })
      .then((s) => {
        if (baselineKeyRef.current !== myKey) return;
        setBaselineSummary(s);
        setBaselineLoading(false);
      })
      .catch((err) => {
        if ((err as Error)?.name === "AbortError") return;
        if (baselineKeyRef.current !== myKey) return;
        setBaselineLoading(false);
      });
    return () => ctrl.abort();
  }, [dateFilter, selectedDay]);

  function handleLogUpdated(updated: TransactionLog) {
    setLogs((prev) => prev.map((l) => (l.log_id === updated.log_id ? updated : l)));
    setSelection({ kind: "log", log: updated });
  }

  function handleBatchCancelled(batchId: string) {
    setLogs((prev) =>
      prev.map((l) => (l.operation_batch_id === batchId ? { ...l, cancelled: true } : l)),
    );
  }

  function handleSelectLog(log: TransactionLog) {
    setSelectionStack([]);
    setSelection((c) =>
      c?.kind === "log" && c.log.log_id === log.log_id ? null : { kind: "log", log },
    );
  }

  function handleSelectBatch(batchId: string, batchLogs: TransactionLog[]) {
    setSelectionStack([]);
    setSelection((c) =>
      c?.kind === "batch" && c.batchId === batchId
        ? null
        : { kind: "batch", batchId, logs: batchLogs },
    );
  }

  function navigateToLog(log: TransactionLog) {
    // 다른 날짜 거래로 이동하면 selectedDay 를 맞춰 리스트가 그 거래를 포함하게 한다
    // (데스크톱 동작 복제 — 393px 라 시트가 리스트를 덮어 scrollIntoView 는 생략).
    const logYmd = toDateKey(log.created_at);
    if (logYmd && logYmd !== selectedDay) {
      setSelectedDay(logYmd);
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

  const sheetTitle =
    displaySelection?.kind === "log"
      ? displaySelection.log.item_name
      : displaySelection?.kind === "batch"
      ? `${displaySelection.logs[0]?.item_name ?? "묶음"}${
          displaySelection.logs.length > 1
            ? ` 외 ${displaySelection.logs.length - 1}건`
            : ""
        }`
      : "내역 상세";
  const sheetSubtitle =
    displaySelection?.kind === "log"
      ? `${displaySelection.log.mes_code ?? "-"} · ${formatHistoryDate(
          displaySelection.log.created_at,
        )}`
      : displaySelection?.kind === "batch"
      ? `${getHistoryDisplayLabel(displaySelection.logs[0])} · ${formatHistoryDate(
          displaySelection.logs[0].created_at,
        )} · ${getHistoryActor(displaySelection.logs[0])}`
      : "";

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" style={{ background: LEGACY_COLORS.bg }}>
      <div className="scrollbar-hide min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3 px-3 pb-6 pt-3">
          <HistoryStatsBar
            baseline={baselineSummary}
            currentCount={summary?.total ?? null}
            loading={summaryLoading || baselineLoading}
            periodLabel={periodLabel}
          />

          <HistoryFilterBar
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
            setSelectedDay={setSelectedDay}
            hideWeekends
          />

          <MobileHistoryList
            loading={loading}
            filteredLogs={logs}
            selectedKey={selectedKey}
            onSelectLog={handleSelectLog}
            onSelectBatch={handleSelectBatch}
            canLoadMore={canLoadMore}
            loadingMore={loadingMore}
            onLoadMore={() => void loadMore()}
          />
        </div>
      </div>

      <BottomSheet open={!!selection} onClose={closeSheet} ariaLabel={`${sheetTitle} 상세`}>
        {displaySelection && (
          <div className="px-5">
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
              <div className="text-lg font-black leading-tight" style={{ color: LEGACY_COLORS.text }}>
                {sheetTitle}
              </div>
              <div
                className="mt-0.5 truncate text-xs font-semibold"
                style={{ color: LEGACY_COLORS.muted2 }}
              >
                {sheetSubtitle}
              </div>
            </div>

            {displaySelection.kind === "log" && (
              <HistoryDetailPanel
                selected={displaySelection.log}
                onSelectLog={navigateToLog}
                onLogUpdated={handleLogUpdated}
              />
            )}
            {displaySelection.kind === "batch" && (
              <HistoryBatchDetailPanel
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
