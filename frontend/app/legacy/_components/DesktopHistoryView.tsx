"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, type TransactionLog } from "@/lib/api";
import { productionApi, type TransactionSummary } from "@/lib/api/production";
import type { IoBatch } from "@/lib/api/types/io";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { HistoryFilterBar } from "./_history_sections/HistoryFilterBar";
import { HistoryCalendarPanel } from "./_history_sections/HistoryCalendarPanel";
import { HistoryStatsBar } from "./_history_sections/HistoryStatsBar";
import { HistoryTable } from "./_history_sections/HistoryTable";
import { DesktopHistoryRightPanel } from "./_history_sections/DesktopHistoryRightPanel";
import { useHistoryData } from "./_hooks/useHistoryData";
import { useCurrentOperator } from "./login/useCurrentOperator";
import { parseUtc, toDateKey } from "./_history_sections/historyFormat";
import { getDefaultHistoryScopeForOperator, type HistoryScope } from "./_history_sections/transactionTaxonomy";
import { type HistorySelection } from "./_history_sections/historyConstants";
import {
  TRANSACTION_TYPES_NONE,
  dateFilterToFrom,
  intersectTransactionTypes,
} from "./_history_sections/historyQuery";

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

  // 사용자별 기본 scope — operator 로드 후 1회만 적용.
  // 사용자가 칩으로 직접 바꾼 뒤에는 didApplyDefaultScopeRef 가드로 덮어쓰지 않음.
  const operator = useCurrentOperator();
  const didApplyDefaultScopeRef = useRef(false);
  useEffect(() => {
    if (didApplyDefaultScopeRef.current) return;
    if (!operator) return;
    didApplyDefaultScopeRef.current = true;
    setScope(getDefaultHistoryScopeForOperator(operator));
  }, [operator]);

  const [selection, setSelection] = useState<HistorySelection | null>(null);
  const [itemRecentLogs, setItemRecentLogs] = useState<TransactionLog[]>([]);

  // batchCache — HistoryTable 의 visible lazy fetch + 우측 batch 상세 패널이 공유.
  const [batchCache, setBatchCache] = useState<Map<string, IoBatch>>(new Map());

  // 달력 — 상단 접이식 패널. 기본 접힘. 펼쳤을 때만 월간 fetch.
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarLogs, setCalendarLogs] = useState<TransactionLog[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const now = new Date();
  const [calendarYear, setCalendarYear] = useState(now.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const lastSelectionRef = useRef<HistorySelection | null>(null);

  const { logs, setLogs, loading, loadingMore, canLoadMore, loadMore } = useHistoryData({
    scope,
    typeFilter,
    dateFilter,
    debouncedSearch,
    selectedDateKey: selectedDay,
  });

  // selection.kind === "log" 일 때만 같은 품목 최근 거래 로드.
  useEffect(() => {
    if (selection?.kind !== "log") {
      setItemRecentLogs([]);
      return;
    }
    const log = selection.log;
    void api
      .getTransactions({ itemId: log.item_id, limit: 6 })
      .then((data) => {
        setItemRecentLogs(data.filter((l) => l.log_id !== log.log_id).slice(0, 5));
      })
      .catch(() => setItemRecentLogs([]));
  }, [selection]);

  // 달력 fetch — 패널이 펼쳐진 동안에만. 목록과 같은 scope/typeFilter/debouncedSearch 적용.
  // 선택 날짜는 fetch 조건에 포함하지 않음 — 달력은 월 전체 카운트 표시.
  useEffect(() => {
    if (!calendarOpen) return;

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
  }, [calendarOpen, calendarYear, calendarMonth, scope, typeFilter, debouncedSearch]);

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

  const todayKey = toDateKey(new Date().toISOString());

  // KPI summary — 조건 전체 카운트. 백엔드 /transactions/summary 호출.
  // 100건 페이지네이션과 무관하게 "이번 달 전체"를 보여줌.
  const [summary, setSummary] = useState<TransactionSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const summaryKeyRef = useRef("");

  useEffect(() => {
    const transactionTypes = intersectTransactionTypes(scope, typeFilter);
    const dateFrom = selectedDay ?? dateFilterToFrom(dateFilter);
    const dateTo = selectedDay ?? undefined;
    const search = debouncedSearch.trim() || undefined;

    const myKey = `${transactionTypes ?? ""}|${dateFrom ?? ""}|${dateTo ?? ""}|${search ?? ""}`;
    summaryKeyRef.current = myKey;

    if (transactionTypes === TRANSACTION_TYPES_NONE) {
      setSummary({ total: 0, warehouseCount: 0, deptCount: 0, adjustCount: 0 });
      setSummaryLoading(false);
      return;
    }

    setSummaryLoading(true);
    const ctrl = new AbortController();
    void productionApi
      .getTransactionsSummary(
        { transactionTypes, dateFrom, dateTo, search },
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
  }, [scope, typeFilter, dateFilter, selectedDay, debouncedSearch]);

  function handleLogUpdated(updated: TransactionLog) {
    setLogs((prev) => prev.map((l) => (l.log_id === updated.log_id ? updated : l)));
    setSelection({ kind: "log", log: updated });
  }

  function handleLogCorrected(result: { original: TransactionLog; correction: TransactionLog }) {
    setLogs((prev) => {
      const without = prev.filter((l) => l.log_id !== result.original.log_id);
      return [result.correction, result.original, ...without];
    });
    setSelection({ kind: "log", log: result.original });
  }

  function handleSelectLog(log: TransactionLog) {
    setSelection((c) =>
      c?.kind === "log" && c.log.log_id === log.log_id ? null : { kind: "log", log },
    );
  }

  function handleSelectBatch(batchId: string, logs: TransactionLog[]) {
    // 같은 묶음 재클릭 → 우측 패널 닫기 (단일 행 토글과 일관). HistoryTable 에서
    // 펼침 상태도 collapseGroup 으로 동시에 닫음 (selection 닫힘과 BOM 접힘 동기화).
    setSelection((c) =>
      c?.kind === "batch" && c.batchId === batchId ? null : { kind: "batch", batchId, logs },
    );
  }

  // 기간 칩 변경 시 선택 날짜 해제 — 동시에 두 날짜 필터가 살아있으면 사용자가 혼란.
  function handleDateFilterChange(v: string) {
    setDateFilter(v);
    setSelectedDay(null);
  }

  if (selection) lastSelectionRef.current = selection;
  const displaySelection = selection ?? lastSelectionRef.current;

  return (
    <div className="flex min-h-0 flex-1 pl-0 pr-4">
      {/* ── 좌측: 스크롤 영역 ── */}
      <div
        className="scrollbar-hide min-h-0 min-w-0 flex-1 overflow-y-auto rounded-[28px] border"
        style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.bg }}
      >
        <div className="flex flex-col gap-3 pb-6">
          <HistoryStatsBar
            summary={summary}
            summaryLoading={summaryLoading}
            loadedCount={logs.length}
            canLoadMore={canLoadMore}
          />

          <HistoryFilterBar
            search={search}
            setSearch={setSearch}
            dateFilter={dateFilter}
            setDateFilter={handleDateFilterChange}
            typeFilter={typeFilter}
            setTypeFilter={setTypeFilter}
            scope={scope}
            setScope={setScope}
            totalCount={summary?.total ?? logs.length}
          />

          <HistoryCalendarPanel
            open={calendarOpen}
            onToggle={() => setCalendarOpen((o) => !o)}
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

          <HistoryTable
            loading={loading}
            filteredLogs={logs}
            totalCount={summary?.total}
            selection={selection}
            onSelectLog={handleSelectLog}
            onSelectBatch={handleSelectBatch}
            batchCache={batchCache}
            setBatchCache={setBatchCache}
            canLoadMore={canLoadMore}
            loadingMore={loadingMore}
            onLoadMore={() => void loadMore()}
          />
        </div>
      </div>

      <DesktopHistoryRightPanel
        selection={selection}
        displaySelection={displaySelection}
        batchCache={batchCache}
        setBatchCache={setBatchCache}
        itemRecentLogs={itemRecentLogs}
        onSelectLog={handleSelectLog}
        onLogUpdated={handleLogUpdated}
        onLogCorrected={handleLogCorrected}
        onClose={() => setSelection(null)}
      />
    </div>
  );
}
