"use client";

import type { TransactionLog } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { HistoryCalendarStrip } from "./HistoryCalendarStrip";

/**
 * 입출고 내역 달력 본문 — 3차 C8: 자체 헤더/토글 제거.
 * 토글 버튼·연월·"선택:{날짜}✕" 칩은 HistoryFilterBar 컨트롤 줄로 이관.
 * (연·월 라벨은 HistoryCalendarStrip 의 월 네비에 이미 존재.)
 * open=false 면 아무것도 렌더하지 않음.
 */
export interface HistoryCalendarPanelProps {
  open: boolean;
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
  if (!open) return null;
  return (
    <section className="card" style={{ paddingTop: 14, paddingBottom: 14 }}>
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
    </section>
  );
}
