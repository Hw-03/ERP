"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TransactionLog } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import {
  isAdjustmentLike,
  isDepartmentInternalType,
  isWarehouseInvolvedType,
} from "./historyShared";

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
              // KPI 와 일치 — isWarehouseInvolvedType / isDepartmentInternalType / isAdjustmentLike.
              let warehouseCount = 0;
              let deptCount = 0;
              let adjustCount = 0;
              for (const l of dayLogs) {
                if (isWarehouseInvolvedType(l.transaction_type)) warehouseCount++;
                if (isDepartmentInternalType(l.transaction_type)) deptCount++;
                if (isAdjustmentLike(l)) adjustCount++;
              }
              return (
                <button
                  key={key}
                  aria-label={`${calendarYear}년 ${calendarMonth + 1}월 ${day}일${isSelected ? " (선택됨)" : ""}`}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedDay(selectedDay === key ? null : key)}
                  className="flex flex-col items-center rounded-[14px] border p-1.5 transition-colors hover:brightness-110"
                  style={{
                    background: isSelected ? "rgba(101,169,255,.18)" : isToday ? "rgba(101,169,255,.08)" : LEGACY_COLORS.s2,
                    borderColor: isSelected
                      ? LEGACY_COLORS.blue
                      : isToday
                      ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 27%, transparent)`
                      : LEGACY_COLORS.border,
                    minHeight: "132px",
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
                  <div className="mt-1 flex w-full flex-col gap-0.5 px-1">
                    {warehouseCount > 0 && (
                      <span className="text-[11px] font-bold leading-tight" style={{ color: LEGACY_COLORS.green }}>
                        창고 {warehouseCount}건
                      </span>
                    )}
                    {deptCount > 0 && (
                      <span className="text-[11px] font-bold leading-tight" style={{ color: LEGACY_COLORS.cyan }}>
                        부서 {deptCount}건
                      </span>
                    )}
                    {adjustCount > 0 && (
                      <span className="text-[11px] font-bold leading-tight" style={{ color: LEGACY_COLORS.yellow }}>
                        조정 {adjustCount}건
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

        </>
      )}
    </section>
  );
}
