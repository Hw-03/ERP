"use client";

import { CalendarDays, ChevronDown, ChevronUp, X } from "lucide-react";
import type { TransactionLog } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { HistoryCalendarStrip } from "./HistoryCalendarStrip";

/**
 * 입출고 내역 화면 최상단의 접이식 달력 패널.
 * label-calendar-2026-05-15: viewMode 토글 제거. 목록은 항상 노출이고
 * 달력은 본 패널이 펼쳐졌을 때만 본문에 strip 을 그대로 렌더한다.
 */
export interface HistoryCalendarPanelProps {
  open: boolean;
  onToggle: () => void;
  // strip props forward
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
}

export function HistoryCalendarPanel({
  open,
  onToggle,
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
}: HistoryCalendarPanelProps) {
  return (
    <section className="card" style={{ paddingTop: open ? 14 : 10, paddingBottom: open ? 14 : 8 }}>
      {/* 헤더 — 항상 노출 */}
      <div className="flex items-center gap-3">
        <CalendarDays className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
        <span className="text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>
          달력
        </span>
        <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
          {calendarYear}년 {calendarMonth + 1}월
        </span>
        {selectedDay && (
          <span
            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 12%, transparent)`,
              borderColor: `color-mix(in srgb, ${LEGACY_COLORS.blue} 35%, transparent)`,
              color: LEGACY_COLORS.blue,
            }}
          >
            선택: {selectedDay}
            <button
              type="button"
              aria-label="선택 날짜 해제"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedDay(null);
              }}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        )}
        <button
          type="button"
          onClick={onToggle}
          className="ml-auto flex items-center gap-1 rounded-[12px] border px-3 py-1.5 text-xs font-bold transition-colors hover:brightness-110"
          style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
        >
          {open ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" />
              달력 접기
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              달력 펼치기
            </>
          )}
        </button>
      </div>

      {/* 본문 — open 일 때만 strip + legend */}
      {open && (
        <div className="mt-3">
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
          <div
            className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px]"
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            <span style={{ color: LEGACY_COLORS.green, fontWeight: 700 }}>창고</span> = 창고 거래
            <span style={{ color: LEGACY_COLORS.cyan, fontWeight: 700 }}>부서</span> = 부서 거래
            <span style={{ color: LEGACY_COLORS.yellow, fontWeight: 700 }}>조정</span> = 수량 조정
          </div>
        </div>
      )}
    </section>
  );
}
