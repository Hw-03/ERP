"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TransactionLog } from "@/lib/api";
import { LEGACY_COLORS } from "../legacyUi";
import { getTransactionLabel, transactionColor } from "@/lib/mes-status";
import { formatQty } from "@/lib/mes/format";
import { EmptyState } from "../common/EmptyState";
import { formatHistoryDate } from "./historyShared";

type Props = {
  calendarYear: number;
  calendarMonth: number;
  prevMonth: () => void;
  nextMonth: () => void;
  calendarLoading: boolean;
  calendarDays: (number | null)[];
  calendarDayMap: Map<string, TransactionLog[]>;
  todayKey: string;
  selectedDay: string | null;
  setSelectedDay: (key: string | null) => void;
  selectedDayLogs: TransactionLog[];
  selectedLogId: string | undefined;
  onSelectLog: (log: TransactionLog) => void;
};

export function HistoryCalendarStrip({
  calendarYear,
  calendarMonth,
  prevMonth,
  nextMonth,
  calendarLoading,
  calendarDays,
  calendarDayMap,
  todayKey,
  selectedDay,
  setSelectedDay,
  selectedDayLogs,
  selectedLogId,
  onSelectLog,
}: Props) {
  return (
    <section className="card">
      {/* 월 네비게이션 */}
      <div
        className="mb-4 flex items-center justify-between rounded-[20px] border px-5 py-3"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        <button onClick={prevMonth} className="rounded-full p-1.5 hover:bg-white/10">
          <ChevronLeft className="h-4 w-4" style={{ color: LEGACY_COLORS.muted2 }} />
        </button>
        <span className="text-base font-bold">
          {calendarYear}년 {calendarMonth + 1}월
        </span>
        <button onClick={nextMonth} className="rounded-full p-1.5 hover:bg-white/10">
          <ChevronRight className="h-4 w-4" style={{ color: LEGACY_COLORS.muted2 }} />
        </button>
      </div>

      {calendarLoading ? (
        <div className="py-12 text-center text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
          달력 데이터 불러오는 중...
        </div>
      ) : (
        <>
          {/* 요일 헤더 */}
          <div className="mb-1 grid grid-cols-7">
            {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
              <div
                key={d}
                className="py-1 text-center text-xs font-bold"
                style={{
                  color: i === 0 ? "#f25f5c" : i === 6 ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2,
                }}
              >
                {d}
              </div>
            ))}
          </div>

          {/* 날짜 그리드 */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, idx) => {
              if (day === null) return <div key={`empty-${idx}`} />;
              const mm = String(calendarMonth + 1).padStart(2, "0");
              const dd = String(day).padStart(2, "0");
              const key = `${calendarYear}-${mm}-${dd}`;
              const dayLogs = calendarDayMap.get(key) ?? [];
              const isToday = key === todayKey;
              const isSelected = key === selectedDay;
              const hasReceive = dayLogs.some((l) => l.transaction_type === "RECEIVE" || l.transaction_type === "PRODUCE");
              const hasShip = dayLogs.some((l) => l.transaction_type === "SHIP" || l.transaction_type === "BACKFLUSH");
              const hasAdjust = dayLogs.some((l) => l.transaction_type === "ADJUST");
              return (
                <button
                  key={key}
                  onClick={() => setSelectedDay(selectedDay === key ? null : key)}
                  className="flex flex-col items-center rounded-[14px] border p-2 transition-colors hover:brightness-110"
                  style={{
                    background: isSelected ? "rgba(101,169,255,.18)" : isToday ? "rgba(101,169,255,.08)" : LEGACY_COLORS.s2,
                    borderColor: isSelected
                      ? LEGACY_COLORS.blue
                      : isToday
                      ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 27%, transparent)`
                      : LEGACY_COLORS.border,
                    minHeight: "64px",
                  }}
                >
                  <span className="text-sm font-bold" style={{ color: isToday ? LEGACY_COLORS.blue : LEGACY_COLORS.text }}>
                    {day}
                  </span>
                  {dayLogs.length > 0 && (
                    <span
                      className="mt-1 rounded-full px-1.5 py-0.5 text-xs font-bold"
                      style={{ background: "rgba(101,169,255,.2)", color: LEGACY_COLORS.blue }}
                    >
                      {dayLogs.length}
                    </span>
                  )}
                  <div className="mt-1 flex gap-0.5">
                    {hasReceive && <span className="h-1.5 w-1.5 rounded-full" style={{ background: LEGACY_COLORS.green }} />}
                    {hasShip && <span className="h-1.5 w-1.5 rounded-full" style={{ background: LEGACY_COLORS.red }} />}
                    {hasAdjust && <span className="h-1.5 w-1.5 rounded-full" style={{ background: LEGACY_COLORS.yellow }} />}
                  </div>
                </button>
              );
            })}
          </div>

          {/* 선택일 거래 목록 */}
          {selectedDay && (
            <div
              className="mt-4 rounded-[20px] border p-4"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
            >
              <div className="mb-3 text-sm font-bold">
                {selectedDay} 거래 {selectedDayLogs.length}건
              </div>
              {selectedDayLogs.length === 0 ? (
                <EmptyState
                  variant="no-data"
                  compact
                  title="거래 없음"
                  description="선택한 날짜에 처리된 거래가 없습니다."
                />
              ) : (
                <div className="space-y-2">
                  {selectedDayLogs.map((log) => {
                    const tcolor = transactionColor(log.transaction_type);
                    return (
                      <button
                        key={log.log_id}
                        onClick={() => onSelectLog(log)}
                        className="flex w-full items-center gap-3 rounded-[14px] border px-3 py-2.5 text-left transition-all hover:brightness-110"
                        style={{
                          background: selectedLogId === log.log_id ? "rgba(101,169,255,.10)" : LEGACY_COLORS.s1,
                          borderColor: selectedLogId === log.log_id ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
                        }}
                      >
                        <span
                          className="inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-bold"
                          style={{ background: `color-mix(in srgb, ${tcolor} 14%, transparent)`, color: tcolor }}
                        >
                          {getTransactionLabel(log.transaction_type)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm">{log.item_name}</span>
                        <span className="shrink-0 text-sm font-bold" style={{ color: tcolor }}>
                          {Number(log.quantity_change) >= 0 ? "+" : ""}
                          {formatQty(log.quantity_change)}
                        </span>
                        <span className="shrink-0 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                          {formatHistoryDate(log.created_at).split(" ")[1]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
