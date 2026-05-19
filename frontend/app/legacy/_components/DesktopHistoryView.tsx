"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, type TransactionLog } from "@/lib/api";
import { productionApi, type TransactionSummary } from "@/lib/api/production";
import type { IoBatch } from "@/lib/api/types/io";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { HistoryFilterBar } from "./_history_sections/HistoryFilterBar";
import { HistoryFilterPanel } from "./_history_sections/HistoryFilterPanel";
import { HistoryCalendarPanel } from "./_history_sections/HistoryCalendarPanel";
import { HistoryStatsBar } from "./_history_sections/HistoryStatsBar";
import { HistoryTable } from "./_history_sections/HistoryTable";
import { DesktopHistoryRightPanel } from "./_history_sections/DesktopHistoryRightPanel";
import { useHistoryData } from "./_hooks/useHistoryData";
import { parseUtc, toDateKey } from "./_history_sections/historyFormat";
import { type HistorySelection } from "./_history_sections/historyConstants";
import { DATE_OPTIONS, dateFilterToFrom } from "./_history_sections/historyQuery";

const SEARCH_DEBOUNCE_MS = 350;

export function DesktopHistoryView() {
  // 3차: 상단 KPI 박스는 표시 전용(클릭 필터 폐기). 필터는 "필터" 패널 단일.
  // scope/typeFilter/activeBucket·부서 전개 상태 없음 — 항상 "전체"로 시작.
  // 대시보드식 독립 필터 패널 (부서·모델·거래종류 다중 선택).
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [selectedOps, setSelectedOps] = useState<string[]>([]);
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

  // 필터 패널 "모델 구분" 칩 소스 — 1회 로드.
  useEffect(() => {
    void api
      .getModels()
      .then((ms) => {
        const names = Array.from(
          new Set(ms.map((m) => m.model_name).filter((n): n is string => !!n)),
        );
        setAvailableModels(names);
      })
      .catch(() => {});
  }, []);

  function toggleModel(v: string) {
    setSelectedModels((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]));
  }
  function toggleDept(v: string) {
    setSelectedDepts((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]));
  }
  function toggleOp(v: string) {
    setSelectedOps((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]));
  }

  const [selection, setSelection] = useState<HistorySelection | null>(null);
  // 우측 패널 내 드릴(BOM 하위·최근거래) 뒤로가기 스택. 표 행 클릭은 top-level 이라 스택 비움.
  const [selectionStack, setSelectionStack] = useState<HistorySelection[]>([]);
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

  const periodLabel = selectedDay
    ? selectedDay
    : (DATE_OPTIONS.find((o) => o.value === dateFilter)?.label ?? "전체");

  const { logs, setLogs, loading, loadingMore, canLoadMore, loadMore } = useHistoryData({
    operations: opParam,
    dateFilter,
    debouncedSearch,
    selectedDateKey: selectedDay,
    department: deptParam,
    model: modelParam,
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

  // X(분자) summary — 현재 필터(거래종류/검색/부서/모델) 전체 카운트. 페이지네이션 무관.
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

  // Y(분모) baseline summary — 선택한 기간만 필터. 거래종류/검색/부서/모델 무시.
  // 상단 박스 숫자·부서칩·"{기간} Y건 중 X건"의 Y 를 고정 제공.
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

  function handleLogCorrected(result: { original: TransactionLog; correction: TransactionLog }) {
    setLogs((prev) => {
      const without = prev.filter((l) => l.log_id !== result.original.log_id);
      return [result.correction, result.original, ...without];
    });
    setSelection({ kind: "log", log: result.original });
  }

  // 표 행 클릭(top-level) — 드릴 스택 초기화.
  function handleSelectLog(log: TransactionLog) {
    setSelectionStack([]);
    setSelection((c) =>
      c?.kind === "log" && c.log.log_id === log.log_id ? null : { kind: "log", log },
    );
  }

  function handleSelectBatch(batchId: string, logs: TransactionLog[]) {
    // 같은 묶음 재클릭 → 우측 패널 닫기 (단일 행 토글과 일관). HistoryTable 에서
    // 펼침 상태도 collapseGroup 으로 동시에 닫음 (selection 닫힘과 BOM 접힘 동기화).
    setSelectionStack([]);
    setSelection((c) =>
      c?.kind === "batch" && c.batchId === batchId ? null : { kind: "batch", batchId, logs },
    );
  }

  // 우측 패널 내부 드릴(BOM 하위 라인·이 품목 최근 거래) — 현재 선택을 스택에 쌓고 이동.
  function navigateToLog(log: TransactionLog) {
    setSelection((cur) => {
      if (cur && !(cur.kind === "log" && cur.log.log_id === log.log_id)) {
        setSelectionStack((s) => [...s, cur]);
        if (typeof window !== "undefined") {
          window.history.pushState({ historyDrill: true }, "");
        }
      }
      return { kind: "log", log };
    });
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

  // 브라우저 뒤로가기 → 드릴 스택이 있으면 그걸 pop (탭 URL 네비 방해 최소화: 스택 있을 때만 관여).
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

  // 기간 칩 변경 시 선택 날짜 해제 — 동시에 두 날짜 필터가 살아있으면 사용자가 혼란.
  function handleDateFilterChange(v: string) {
    setDateFilter(v);
    setSelectedDay(null);
  }

  if (selection) lastSelectionRef.current = selection;
  const displaySelection = selection ?? lastSelectionRef.current;

  const activeFilterCount = selectedDepts.length + selectedModels.length + selectedOps.length;

  return (
    <div className="flex min-h-0 flex-1 pl-0 pr-4">
      {/* ── 좌측: 스크롤 영역 ── */}
      <div
        className="scrollbar-hide min-h-0 min-w-0 flex-1 overflow-y-auto rounded-[28px] border"
        style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.bg }}
      >
        <div className="flex flex-col gap-3 pb-6">
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
              />
            </section>
          )}

          <HistoryCalendarPanel
            open={calendarOpen}
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
        onSelectLog={navigateToLog}
        canGoBack={selectionStack.length > 0}
        onBack={goBack}
        onLogUpdated={handleLogUpdated}
        onLogCorrected={handleLogCorrected}
        onClose={() => {
          setSelectionStack([]);
          setSelection(null);
        }}
      />
    </div>
  );
}
