"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, TrendingDown, TrendingUp } from "lucide-react";
import { api, type TransactionLog, type TransactionType } from "@/lib/api";
import { DesktopRightPanel } from "./DesktopRightPanel";
import { LEGACY_COLORS, formatNumber } from "./legacyUi";
import { HistoryFilterBar } from "./_history_sections/HistoryFilterBar";
import { HistoryCalendarStrip } from "./_history_sections/HistoryCalendarStrip";
import { HistoryTable } from "./_history_sections/HistoryTable";
import { HistoryDetailPanel } from "./_history_sections/HistoryDetailPanel";
import {
  EXCEPTION_TYPES,
  HISTORY_PAGE_SIZE,
  formatHistoryDate,
  getPeriodStart,
  parseUtc,
  toDateKey,
} from "./_history_sections/historyShared";

export function DesktopHistoryView() {
  const [logs, setLogs] = useState<TransactionLog[]>([]);
  const [calendarLogs, setCalendarLogs] = useState<TransactionLog[]>([]);
  const [selected, setSelected] = useState<TransactionLog | null>(null);
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [dateFilter, setDateFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [copiedRef, setCopiedRef] = useState<string | null>(null);
  const [itemRecentLogs, setItemRecentLogs] = useState<TransactionLog[]>([]);

  const [viewMode, setViewMode] = useState<"list" | "calendar">("calendar");
  const now = new Date();
  const [calendarYear, setCalendarYear] = useState(now.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const lastSelectedRef = useRef<TransactionLog | null>(null);

  useEffect(() => {
    setLoading(true);
    void api
      .getTransactions({ limit: HISTORY_PAGE_SIZE, skip: 0 })
      .then((data) => {
        setLogs(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

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

  useEffect(() => {
    if (viewMode !== "calendar") return;
    setCalendarLoading(true);
    setSelectedDay(null);
    void api
      .getTransactions({ limit: 2000, skip: 0 })
      .then((data) => {
        setCalendarLogs(data);
        setCalendarLoading(false);
      })
      .catch(() => setCalendarLoading(false));
  }, [viewMode]);

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

  const filteredLogs = useMemo(() => {
    const start = getPeriodStart(dateFilter);
    return logs.filter((log) => {
      if (typeFilter === "EXCEPTION") {
        if (!EXCEPTION_TYPES.has(log.transaction_type)) return false;
      } else if (typeFilter !== "ALL" && log.transaction_type !== (typeFilter as TransactionType)) return false;
      if (start && parseUtc(log.created_at) < start) return false;
      if (search.trim()) {
        const kw = search.trim().toLowerCase();
        const hay = `${log.item_name} ${log.erp_code} ${log.reference_no ?? ""} ${log.notes ?? ""} ${log.produced_by ?? ""}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [logs, typeFilter, dateFilter, search]);

  const stats = useMemo(() => {
    let receiveSum = 0;
    let shipSum = 0;
    let exceptionCount = 0;
    for (const log of filteredLogs) {
      if (log.transaction_type === "RECEIVE" || log.transaction_type === "PRODUCE") {
        receiveSum += Number(log.quantity_change);
      }
      if (log.transaction_type === "SHIP" || log.transaction_type === "BACKFLUSH") {
        shipSum += Math.abs(Number(log.quantity_change));
      }
      if (EXCEPTION_TYPES.has(log.transaction_type) || log.transaction_type === "BACKFLUSH") {
        exceptionCount++;
      }
    }
    return { total: filteredLogs.length, receiveSum, shipSum, exceptionCount };
  }, [filteredLogs]);

  const canLoadMore = logs.length >= page * HISTORY_PAGE_SIZE;

  async function loadMore() {
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const more = await api.getTransactions({
        limit: HISTORY_PAGE_SIZE,
        skip: (nextPage - 1) * HISTORY_PAGE_SIZE,
      });
      setLogs((prev) => [...prev, ...more]);
      setPage(nextPage);
    } finally {
      setLoadingMore(false);
    }
  }

  function handleLogUpdated(updated: TransactionLog) {
    setLogs((prev) => prev.map((l) => (l.log_id === updated.log_id ? updated : l)));
    setSelected(updated);
  }

  function handleLogCorrected(result: { original: TransactionLog; correction: TransactionLog }) {
    // 원본 로그 갱신 + 보정 거래 prepend
    setLogs((prev) => {
      const without = prev.filter((l) => l.log_id !== result.original.log_id);
      return [result.correction, result.original, ...without];
    });
    setSelected(result.original);
  }

  function copyRef(ref: string, e: React.MouseEvent) {
    e.stopPropagation();
    void navigator.clipboard.writeText(ref).then(() => {
      setCopiedRef(ref);
      setTimeout(() => setCopiedRef(null), 1500);
    });
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
          {/* ── 요약 통계 카드 ── */}
          <section className="card">
            <div className="grid grid-cols-4 gap-3">
              <div
                className="flex flex-col gap-1 rounded-[20px] border p-4"
                style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
              >
                <div className="text-sm font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.muted2 }}>
                  조회 건수
                </div>
                <div className="text-2xl font-black">{formatNumber(stats.total)}</div>
                <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>현재 로드 기준</div>
                {canLoadMore && (
                  <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>(+더 불러올 수 있음)</div>
                )}
              </div>
              <div
                className="flex flex-col gap-1 rounded-[20px] border p-4"
                style={{ background: "rgba(67,211,157,.06)", borderColor: "rgba(67,211,157,.22)" }}
              >
                <div
                  className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-[0.15em]"
                  style={{ color: LEGACY_COLORS.green }}
                >
                  <TrendingUp className="h-3.5 w-3.5" />
                  입고 합계
                </div>
                <div className="text-2xl font-black" style={{ color: LEGACY_COLORS.green }}>
                  +{formatNumber(stats.receiveSum)}
                </div>
                <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>RECEIVE · PRODUCE</div>
              </div>
              <div
                className="flex flex-col gap-1 rounded-[20px] border p-4"
                style={{ background: "rgba(255,123,123,.06)", borderColor: "rgba(255,123,123,.22)" }}
              >
                <div
                  className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-[0.15em]"
                  style={{ color: LEGACY_COLORS.red }}
                >
                  <TrendingDown className="h-3.5 w-3.5" />
                  출고 합계
                </div>
                <div className="text-2xl font-black" style={{ color: LEGACY_COLORS.red }}>
                  -{formatNumber(stats.shipSum)}
                </div>
                <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>SHIP · BACKFLUSH</div>
              </div>
              <div
                className="flex flex-col gap-1 rounded-[20px] border p-4"
                style={{ background: "rgba(246,198,103,.06)", borderColor: "rgba(246,198,103,.22)" }}
              >
                <div
                  className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-[0.15em]"
                  style={{ color: LEGACY_COLORS.yellow }}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  예외 거래
                </div>
                <div className="text-2xl font-black" style={{ color: LEGACY_COLORS.yellow }}>
                  {formatNumber(stats.exceptionCount)}
                </div>
                <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>조정·폐기·손실·예외</div>
              </div>
            </div>
          </section>

          <HistoryFilterBar
            search={search}
            setSearch={setSearch}
            dateFilter={dateFilter}
            setDateFilter={setDateFilter}
            viewMode={viewMode}
            setViewMode={setViewMode}
            typeFilter={typeFilter}
            setTypeFilter={setTypeFilter}
            totalCount={stats.total}
          />

          {viewMode === "calendar" && (
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
              selectedDayLogs={selectedDayLogs}
              selectedLogId={selected?.log_id}
              onSelectLog={handleSelectLog}
            />
          )}

          {viewMode === "list" && (
            <HistoryTable
              loading={loading}
              filteredLogs={filteredLogs}
              selectedLogId={selected?.log_id}
              onSelectLog={handleSelectLog}
              copiedRef={copiedRef}
              onCopyRef={copyRef}
              canLoadMore={canLoadMore}
              loadingMore={loadingMore}
              onLoadMore={() => void loadMore()}
            />
          )}
        </div>
      </div>

      {/* ── 우측: 상세 패널 ── */}
      <div
        className="shrink-0 overflow-hidden"
        style={{
          width: selected ? 436 : 0,
          transition: "width 160ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <div
          className="h-full pl-4"
          style={{
            opacity: selected ? 1 : 0,
            transform: selected ? "translateX(0)" : "translateX(18px)",
            transition: "opacity 260ms ease, transform 260ms ease",
            willChange: "transform, opacity",
          }}
        >
          {displaySelected && (
            <DesktopRightPanel
              title={displaySelected.item_name}
              subtitle={`${displaySelected.erp_code ?? "-"} · ${formatHistoryDate(displaySelected.created_at)}`}
            >
              <HistoryDetailPanel
                selected={displaySelected}
                itemRecentLogs={itemRecentLogs}
                onSelectLog={(log) => setSelected(log)}
                onLogUpdated={handleLogUpdated}
                onLogCorrected={handleLogCorrected}
              />
            </DesktopRightPanel>
          )}
        </div>
      </div>
    </div>
  );
}
