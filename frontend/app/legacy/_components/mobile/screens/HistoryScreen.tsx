"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Filter,
  History as HistoryIcon,
  List,
} from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { TYPO } from "../tokens";
import { EmptyState, IconButton, KpiCard } from "../primitives";
import { useTransactions } from "../hooks/useTransactions";
import { useMobileHistoryAux } from "../hooks/useMobileHistoryAux";
import {
  useHistoryDerivations,
  toDateKey,
} from "../../_history_hooks/useHistoryDerivations";
import {
  DEFAULT_HISTORY_FILTERS,
  HistoryFilterSheet,
  countActiveHistoryFilters,
  type HistoryFilters,
} from "./HistoryFilterSheet";
import { HistoryLogRow } from "./_history_parts/HistoryLogRow";
import { HistoryCalendarView } from "./_history_parts/HistoryCalendarView";

export function HistoryScreen({ onClose }: { onClose: () => void }) {
  const { logs, loading, hasMore, loadMore } = useTransactions();
  const [filters, setFilters] = useState<HistoryFilters>(DEFAULT_HISTORY_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const now = new Date();
  const [calendarYear, setCalendarYear] = useState(now.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [copiedRef, setCopiedRef] = useState<string | null>(null);

  // R8-3: items + calendarLogs fetch 는 별도 hook
  const { items, calendarLogs, calendarLoading } = useMobileHistoryAux({
    viewMode,
    calendarYear,
    calendarMonth,
  });

  // viewMode === "calendar" 진입 시 selectedDay 초기화 (hook 외부 — 표시 로직)
  useEffect(() => {
    if (viewMode === "calendar") setSelectedDay(null);
  }, [viewMode]);

  const {
    employeeNames,
    modelNames,
    filteredLogs,
    summary,
    groupedByDay,
    calendarDayMap,
    calendarDays,
  } = useHistoryDerivations(logs, filters, items, calendarLogs, calendarYear, calendarMonth);

  const activeFilterCount = countActiveHistoryFilters(filters);
  const todayKey = toDateKey(new Date().toISOString());

  const copyRef = (ref: string) => {
    void navigator.clipboard.writeText(ref).then(() => {
      setCopiedRef(ref);
      setTimeout(() => setCopiedRef(null), 1500);
    });
  };

  const prevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarYear((y) => y - 1);
      setCalendarMonth(11);
    } else setCalendarMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarYear((y) => y + 1);
      setCalendarMonth(0);
    } else setCalendarMonth((m) => m + 1);
  };

  return (
    <div className="flex flex-col gap-3 px-4 pb-6 pt-3">
      <div className="flex items-center gap-2">
        <IconButton icon={ArrowLeft} label="이전" size="md" onClick={onClose} color={LEGACY_COLORS.muted2} />
        <div className="flex-1" />
        <div
          className="flex overflow-hidden rounded-[14px] border"
          style={{ borderColor: LEGACY_COLORS.border }}
        >
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={`${TYPO.caption} flex items-center gap-1 px-3 py-2 font-bold`}
            style={{
              background: viewMode === "list" ? LEGACY_COLORS.blue : "transparent",
              color: viewMode === "list" ? LEGACY_COLORS.white : LEGACY_COLORS.muted2,
            }}
          >
            <List size={14} /> 목록
          </button>
          <button
            type="button"
            onClick={() => setViewMode("calendar")}
            className={`${TYPO.caption} flex items-center gap-1 px-3 py-2 font-bold`}
            style={{
              background: viewMode === "calendar" ? LEGACY_COLORS.blue : "transparent",
              color: viewMode === "calendar" ? LEGACY_COLORS.white : LEGACY_COLORS.muted2,
            }}
          >
            <CalendarDays size={14} /> 달력
          </button>
        </div>
        <IconButton
          icon={Filter}
          label="필터"
          size="md"
          color={activeFilterCount > 0 ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2}
          onClick={() => setFilterOpen(true)}
          badge={activeFilterCount}
        />
      </div>

      {viewMode === "list" ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            <KpiCard label="조회 기준" value={summary.total} color={LEGACY_COLORS.blue} />
            <KpiCard label="입고합" value={formatQty(summary.inSum)} color={LEGACY_COLORS.green} />
            <KpiCard label="출고합" value={formatQty(summary.outSum)} color={LEGACY_COLORS.red} />
          </div>

          {loading && logs.length === 0 ? (
            <div className={`${TYPO.body} py-10 text-center`} style={{ color: LEGACY_COLORS.muted2 }}>
              불러오는 중…
            </div>
          ) : filteredLogs.length === 0 ? (
            <EmptyState
              icon={HistoryIcon}
              title="조건에 맞는 거래가 없습니다"
              description="필터를 조정해 보세요."
            />
          ) : (
            <div className="flex flex-col gap-4">
              {groupedByDay.map(([day, dayLogs]) => (
                <div key={day} className="flex flex-col gap-2">
                  <div
                    className={`${TYPO.caption} font-bold`}
                    style={{ color: LEGACY_COLORS.muted2 }}
                  >
                    {new Date(day + "T00:00:00").toLocaleDateString("ko-KR", {
                      month: "long",
                      day: "numeric",
                      weekday: "short",
                    })}{" "}
                    · {dayLogs.length}건
                  </div>
                  <div
                    className="overflow-hidden rounded-[20px] border"
                    style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
                  >
                    {dayLogs.map((log, idx) => (
                      <div
                        key={log.log_id}
                        style={{
                          borderBottom:
                            idx === dayLogs.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`,
                        }}
                      >
                        <HistoryLogRow log={log} copiedRef={copiedRef} onCopy={copyRef} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {hasMore ? (
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  className={`${TYPO.body} rounded-[14px] border py-3 font-semibold`}
                  style={{
                    background: LEGACY_COLORS.s2,
                    borderColor: LEGACY_COLORS.border,
                    color: LEGACY_COLORS.text,
                  }}
                >
                  {loading ? "불러오는 중…" : "100건 더보기"}
                </button>
              ) : null}
            </div>
          )}
        </>
      ) : (
        <HistoryCalendarView
          calendarYear={calendarYear}
          calendarMonth={calendarMonth}
          calendarDays={calendarDays}
          calendarDayMap={calendarDayMap}
          calendarLoading={calendarLoading}
          selectedDay={selectedDay}
          setSelectedDay={setSelectedDay}
          todayKey={todayKey}
          copiedRef={copiedRef}
          onCopy={copyRef}
          onPrevMonth={prevMonth}
          onNextMonth={nextMonth}
        />
      )}

      <HistoryFilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onChange={setFilters}
        onReset={() => setFilters(DEFAULT_HISTORY_FILTERS)}
        employeeNames={employeeNames}
        modelNames={modelNames}
      />
    </div>
  );
}
