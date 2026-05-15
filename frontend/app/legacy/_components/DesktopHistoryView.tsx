"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, type TransactionLog } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { HistoryFilterBar } from "./_history_sections/HistoryFilterBar";
import { HistoryCalendarStrip } from "./_history_sections/HistoryCalendarStrip";
import { HistoryStatsBar } from "./_history_sections/HistoryStatsBar";
import { HistoryTable } from "./_history_sections/HistoryTable";
import { DesktopHistoryRightPanel } from "./_history_sections/DesktopHistoryRightPanel";
import { useHistoryData } from "./_hooks/useHistoryData";
import {
  TRANSACTION_TYPES_NONE,
  intersectTransactionTypes,
  isDepartmentInternalType,
  isExceptionLike,
  isWarehouseInvolvedType,
  parseUtc,
  toDateKey,
  type HistoryScope,
} from "./_history_sections/historyShared";

const SEARCH_DEBOUNCE_MS = 350;

export function DesktopHistoryView() {
  const [scope, setScope] = useState<HistoryScope>("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [dateFilter, setDateFilter] = useState("MONTH");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // search debounce — 목록과 달력 fetch 가 같은 값을 공유.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  const { logs, setLogs, loading, loadingMore, canLoadMore, loadMore } = useHistoryData({
    scope,
    typeFilter,
    dateFilter,
    debouncedSearch,
  });

  const [calendarLogs, setCalendarLogs] = useState<TransactionLog[]>([]);
  const [selected, setSelected] = useState<TransactionLog | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [itemRecentLogs, setItemRecentLogs] = useState<TransactionLog[]>([]);

  const [viewMode, setViewMode] = useState<"list" | "calendar">("calendar");
  const now = new Date();
  const [calendarYear, setCalendarYear] = useState(now.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const lastSelectedRef = useRef<TransactionLog | null>(null);

  useEffect(() => {
    if (!selected) {
      setItemRecentLogs([]);
      return;
    }
    void api
      .getTransactions({ itemId: selected.item_id, limit: 6 })
      .then((data) => {
        setItemRecentLogs(data.filter((l) => l.log_id !== selected.log_id).slice(0, 5));
      })
      .catch(() => setItemRecentLogs([]));
  }, [selected]);

  // 달력 fetch — 목록과 같은 scope/typeFilter/debouncedSearch 적용.
  useEffect(() => {
    if (viewMode !== "calendar") return;
    setSelectedDay(null);

    const transactionTypes = intersectTransactionTypes(scope, typeFilter);
    if (transactionTypes === TRANSACTION_TYPES_NONE) {
      setCalendarLogs([]);
      setCalendarLoading(false);
      return;
    }

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
          transactionTypes,
          search: debouncedSearch || undefined,
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
  }, [viewMode, calendarYear, calendarMonth, scope, typeFilter, debouncedSearch]);

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

  const selectedDayLogs = useMemo(
    () => (selectedDay ? calendarDayMap.get(selectedDay) ?? [] : []),
    [selectedDay, calendarDayMap],
  );

  const todayKey = toDateKey(new Date().toISOString());

  // 서버사이드 필터링이라 클라 메모리 추가 필터 없음. logs 그대로 표시.
  const stats = useMemo(() => {
    let warehouseCount = 0;
    let deptCount = 0;
    let exceptionCount = 0;
    for (const log of logs) {
      if (isWarehouseInvolvedType(log.transaction_type)) warehouseCount++;
      if (isDepartmentInternalType(log.transaction_type)) deptCount++;
      if (isExceptionLike(log)) exceptionCount++;
    }
    return { total: logs.length, warehouseCount, deptCount, exceptionCount };
  }, [logs]);

  function handleLogUpdated(updated: TransactionLog) {
    setLogs((prev) => prev.map((l) => (l.log_id === updated.log_id ? updated : l)));
    setSelected(updated);
  }

  function handleLogCorrected(result: { original: TransactionLog; correction: TransactionLog }) {
    setLogs((prev) => {
      const without = prev.filter((l) => l.log_id !== result.original.log_id);
      return [result.correction, result.original, ...without];
    });
    setSelected(result.original);
  }

  function handleSelectLog(log: TransactionLog) {
    setSelected((c) => (c?.log_id === log.log_id ? null : log));
  }

  if (selected) lastSelectedRef.current = selected;
  const displaySelected = selected ?? lastSelectedRef.current;

  return (
    <div className="flex min-h-0 flex-1 pl-0 pr-4">
      {/* ── 좌측: 스크롤 영역 ── */}
      <div
        className="scrollbar-hide min-h-0 min-w-0 flex-1 overflow-y-auto rounded-[28px] border"
        style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.bg }}
      >
        <div className="flex flex-col gap-3 pb-6">
          <HistoryStatsBar stats={stats} canLoadMore={canLoadMore} />

          <HistoryFilterBar
            search={search}
            setSearch={setSearch}
            dateFilter={dateFilter}
            setDateFilter={setDateFilter}
            viewMode={viewMode}
            setViewMode={setViewMode}
            typeFilter={typeFilter}
            setTypeFilter={setTypeFilter}
            scope={scope}
            setScope={setScope}
            totalCount={stats.total}
          />

          {viewMode === "calendar" && (
            <>
              <HistoryCalendarStrip
                calendarYear={calendarYear}
                calendarMonth={calendarMonth}
                prevMonth={prevMonth}
                nextMonth={nextMonth}
                calendarLoading={calendarLoading}
                calendarDays={calendarDays}
                calendarDayMap={calendarDayMap}
                todayKey={todayKey}
                selectedDay={selectedDay}
                setSelectedDay={setSelectedDay}
              />
              {selectedDay && (
                <HistoryTable
                  loading={false}
                  filteredLogs={selectedDayLogs}
                  selectedLogId={selected?.log_id}
                  onSelectLog={handleSelectLog}
                  canLoadMore={false}
                  loadingMore={false}
                  onLoadMore={() => {}}
                />
              )}
            </>
          )}

          {viewMode === "list" && (
            <HistoryTable
              loading={loading}
              filteredLogs={logs}
              selectedLogId={selected?.log_id}
              onSelectLog={handleSelectLog}
              canLoadMore={canLoadMore}
              loadingMore={loadingMore}
              onLoadMore={() => void loadMore()}
            />
          )}
        </div>
      </div>

      <DesktopHistoryRightPanel
        selected={selected}
        displaySelected={displaySelected}
        itemRecentLogs={itemRecentLogs}
        onSelectLog={(log) => setSelected(log)}
        onLogUpdated={handleLogUpdated}
        onLogCorrected={handleLogCorrected}
      />
    </div>
  );
}
