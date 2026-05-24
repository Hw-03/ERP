"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { StatusPill } from "../common";

const CAL_MIN = new Date(2026, 0, 1);

export function getWeekStartMonday(d: Date): Date {
  const mon = new Date(d);
  const dow = d.getDay();
  mon.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function getWeekStartSun(d: Date): Date {
  const sun = new Date(d);
  sun.setDate(d.getDate() - d.getDay());
  sun.setHours(0, 0, 0, 0);
  return sun;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getWeeksOfMonth(year: number, month: number): Date[][] {
  const start = getWeekStartSun(new Date(year, month, 1));
  const endOfMonth = new Date(year, month + 1, 0);
  const weeks: Date[][] = [];
  const cur = new Date(start);
  while (cur <= endOfMonth) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

function weekNumOf(weekMon: Date): { year: number; month: number; weekNum: number } {
  const year = weekMon.getFullYear();
  const month = weekMon.getMonth();
  const first = new Date(year, month, 1);
  const dow = first.getDay();
  const daysToFirstMon = (1 - dow + 7) % 7;
  const firstMonday = new Date(year, month, 1 + daysToFirstMon);
  const diffDays = Math.round((weekMon.getTime() - firstMonday.getTime()) / 86400000);
  return { year, month, weekNum: Math.floor(diffDays / 7) + 1 };
}

export function monthlyWeekLabel(weekMon: Date): string {
  const { year, month, weekNum } = weekNumOf(weekMon);
  const sun = new Date(weekMon);
  sun.setDate(weekMon.getDate() + 6);
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  return `${year}년 ${month + 1}월 ${weekNum}주차 (${fmt(weekMon)} ~ ${fmt(sun)})`;
}

/** 모바일 헤더용 축약 라벨 — "5월 3주차" */
export function shortWeekLabel(weekMon: Date): string {
  const { month, weekNum } = weekNumOf(weekMon);
  return `${month + 1}월 ${weekNum}주차`;
}

interface Props {
  weekMon: Date;
  onChange: (d: Date) => void;
}

export function WeeklyWeekPicker({ weekMon, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [hoveredWeek, setHoveredWeek] = useState<string | null>(null);
  const [calMonth, setCalMonth] = useState<Date>(
    () => new Date(weekMon.getFullYear(), weekMon.getMonth(), 1)
  );
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCalMonth(new Date(weekMon.getFullYear(), weekMon.getMonth(), 1));
  }, [weekMon]);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const weekStartStr = toDateStr(weekMon);
  const isThisWeek = toDateStr(getWeekStartMonday(new Date())) === weekStartStr;

  const today = new Date();
  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const canPrevMonth = calMonth > CAL_MIN;
  const canNextMonth = calMonth < thisMonthStart;

  // 이전/다음 주 이동 핸들러
  const thisWeekMon = getWeekStartMonday(new Date());
  const canPrevWeek = weekMon > CAL_MIN;
  const canNextWeek = weekMon < thisWeekMon;

  function handlePrevWeek() {
    if (!canPrevWeek) return;
    onChange(new Date(weekMon.getTime() - 7 * 86400000));
  }
  function handleNextWeek() {
    if (!canNextWeek) return;
    onChange(new Date(weekMon.getTime() + 7 * 86400000));
  }

  return (
    <div ref={rootRef} className="relative flex items-center gap-2">
      {/* 이전 주 */}
      <button
        type="button"
        onClick={handlePrevWeek}
        disabled={!canPrevWeek}
        title="이전 주"
        className="flex h-11 w-11 items-center justify-center rounded-[10px] border transition-colors hover:brightness-110 disabled:opacity-30 lg:h-8 lg:w-8"
        style={{
          background: LEGACY_COLORS.s2,
          borderColor: LEGACY_COLORS.border,
          color: LEGACY_COLORS.muted,
        }}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[44px] items-center gap-2 rounded-[12px] border px-3 py-1.5 transition-colors hover:brightness-110 lg:min-h-0"
        style={{
          background: open
            ? tint(LEGACY_COLORS.blue, 10, LEGACY_COLORS.s2)
            : LEGACY_COLORS.s2,
          borderColor: open ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
          color: LEGACY_COLORS.text,
        }}
      >
        <CalendarDays className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
        <span className="whitespace-nowrap text-[13px] font-black lg:hidden">
          {shortWeekLabel(weekMon)}
        </span>
        <span className="hidden whitespace-nowrap text-[13px] font-black lg:inline">
          {monthlyWeekLabel(weekMon)}
        </span>
        <ChevronDown
          className="h-3.5 w-3.5 shrink-0 transition-transform"
          style={{
            color: LEGACY_COLORS.muted,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {/* 다음 주 */}
      <button
        type="button"
        onClick={handleNextWeek}
        disabled={!canNextWeek}
        title={!canNextWeek ? "미래 주차는 선택 불가" : "다음 주"}
        className="flex h-11 w-11 items-center justify-center rounded-[10px] border transition-colors hover:brightness-110 disabled:opacity-30 lg:h-8 lg:w-8"
        style={{
          background: LEGACY_COLORS.s2,
          borderColor: LEGACY_COLORS.border,
          color: LEGACY_COLORS.muted,
        }}
      >
        <ChevronRight className="h-4 w-4" />
      </button>

      {isThisWeek && (
        <span className="hidden lg:inline-flex">
          <StatusPill label="이번 주" tone="success" showDot={false} />
        </span>
      )}

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-2 rounded-[16px] border p-4 shadow-lg"
          style={{
            background: LEGACY_COLORS.s1,
            borderColor: LEGACY_COLORS.border,
            minWidth: 280,
            maxWidth: "calc(100vw - 32px)",
          }}
        >
          <div className="mb-3 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() =>
                setCalMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))
              }
              disabled={!canPrevMonth}
              className="flex h-7 w-7 items-center justify-center rounded-[10px] border transition-colors hover:brightness-110 disabled:opacity-30"
              style={{
                background: LEGACY_COLORS.s2,
                borderColor: LEGACY_COLORS.border,
                color: LEGACY_COLORS.muted,
              }}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span
              className="text-[14px] font-black"
              style={{ color: LEGACY_COLORS.text }}
            >
              {calMonth.getFullYear()}년 {calMonth.getMonth() + 1}월
            </span>
            <button
              type="button"
              onClick={() =>
                setCalMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))
              }
              disabled={!canNextMonth}
              className="flex h-7 w-7 items-center justify-center rounded-[10px] border transition-colors hover:brightness-110 disabled:opacity-30"
              style={{
                background: LEGACY_COLORS.s2,
                borderColor: LEGACY_COLORS.border,
                color: LEGACY_COLORS.muted,
              }}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7">
            {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
              <div
                key={d}
                className="py-1 text-center text-xs font-bold"
                style={{
                  color:
                    i === 0 ? "#f25f5c" : i === 6 ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2,
                }}
              >
                {d}
              </div>
            ))}
          </div>

          {/* 주간보고 — 의미상 주 단위 선택이므로 클릭 타깃을 주(week) 단위 1개 <button> 으로 통합.
              내부 7개 일자 숫자는 <span> 으로만 노출. 어느 셀을 눌러도 결국 같은 주가 선택되므로
              UI(클릭 가능 영역)와 의미를 일치시킨다. */}
          <div className="flex flex-col gap-y-0.5">
            {getWeeksOfMonth(calMonth.getFullYear(), calMonth.getMonth()).map((week) => {
              const sun = week[0];
              // 일~토 구성이므로 월(index 1)이 주차 기준 시작일
              const mon = new Date(sun.getTime() + 86400000);
              const weekKey = toDateStr(mon);
              const isSelectedWeek = weekKey === weekStartStr;
              const isHovered = hoveredWeek === weekKey;
              const isFuture =
                toDateStr(mon) > toDateStr(getWeekStartMonday(new Date()));
              return (
                <button
                  key={weekKey}
                  type="button"
                  disabled={isFuture}
                  onClick={() => {
                    if (!isFuture) {
                      onChange(new Date(mon));
                      setOpen(false);
                    }
                  }}
                  onMouseEnter={() => !isFuture && setHoveredWeek(weekKey)}
                  onMouseLeave={() => setHoveredWeek(null)}
                  aria-pressed={isSelectedWeek}
                  title={isFuture ? "미래 주차는 선택 불가" : undefined}
                  className="grid grid-cols-7 rounded-[10px] border px-1 py-1.5 transition-colors disabled:opacity-30"
                  style={{
                    background: isSelectedWeek
                      ? "rgba(101,169,255,.18)"
                      : isHovered
                      ? "rgba(101,169,255,.08)"
                      : LEGACY_COLORS.s2,
                    borderColor: isSelectedWeek
                      ? LEGACY_COLORS.blue
                      : isHovered
                      ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 40%, transparent)`
                      : LEGACY_COLORS.border,
                  }}
                >
                  {week.map((d) => {
                    const isOutside = d.getMonth() !== calMonth.getMonth();
                    return (
                      <span
                        key={d.toISOString()}
                        className="text-center text-sm font-bold"
                        style={{
                          color: isOutside
                            ? LEGACY_COLORS.muted2
                            : isSelectedWeek
                            ? LEGACY_COLORS.blue
                            : LEGACY_COLORS.text,
                        }}
                      >
                        {d.getDate()}
                      </span>
                    );
                  })}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
