"use client";

import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { formatWorkDateLabel, isFutureKstDate } from "./dailyReportDate";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** 화살표 이동 방향에서 가장 가까운 평일 날짜를 반환한다. */
function shiftDate(value: string, days: -1 | 1): string {
  const next = parseDateKey(value);
  next.setDate(next.getDate() + days);
  while (next.getDay() === 0 || next.getDay() === 6) {
    next.setDate(next.getDate() + days);
  }
  return toDateKey(next);
}

function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function calendarDays(month: Date): Date[] {
  const start = new Date(month.getFullYear(), month.getMonth(), 1 - month.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function dateLabel(date: Date): string {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

interface DailyWorkDatePickerProps {
  value: string;
  maxDate: string;
  onChange: (value: string) => void;
}

export function DailyWorkDatePicker({ value, maxDate, onChange }: DailyWorkDatePickerProps) {
  const [open, setOpen] = useState(false);
  const [calMonth, setCalMonth] = useState(() => monthStart(parseDateKey(value)));
  const rootRef = useRef<HTMLDivElement>(null);
  const maxMonth = monthStart(parseDateKey(maxDate));
  const canNextMonth = calMonth < maxMonth;
  const nextWorkDate = shiftDate(value, 1);
  const canNextDay = nextWorkDate <= maxDate;

  useEffect(() => {
    setCalMonth(monthStart(parseDateKey(value)));
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label="전일"
        title="전일"
        onClick={() => onChange(shiftDate(value, -1))}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border transition-colors hover:brightness-110 lg:h-8 lg:w-8"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted }}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <div ref={rootRef} className="relative">
        <button
          type="button"
          aria-label="일보 날짜 선택"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="flex min-h-11 items-center gap-2 rounded-[12px] border px-3 text-sm font-black transition-colors hover:brightness-110"
          style={{
            background: open ? tint(LEGACY_COLORS.blue, 10, LEGACY_COLORS.s2) : LEGACY_COLORS.s2,
            borderColor: open ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
            color: LEGACY_COLORS.text,
          }}
        >
          <CalendarDays className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
          <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>작성일</span>
          <span className="whitespace-nowrap">{formatWorkDateLabel(value)}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform" style={{ color: LEGACY_COLORS.muted, transform: open ? "rotate(180deg)" : "rotate(0deg)" }} />
        </button>

        {open && (
          <div
            role="dialog"
            aria-label="일보 날짜 선택"
            className="absolute right-0 top-full z-50 mt-2 rounded-[16px] border p-4"
            style={{
              background: LEGACY_COLORS.s1,
              borderColor: LEGACY_COLORS.border,
              boxShadow: "var(--c-card-shadow)",
              minWidth: 280,
              maxWidth: "calc(100vw - 32px)",
            }}
          >
          <div className="mb-3 flex items-center justify-center gap-3">
            <button
              type="button"
              aria-label="이전 달"
              onClick={() => setCalMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              className="flex h-7 w-7 items-center justify-center rounded-[10px] border transition-colors hover:brightness-110"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted }}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-24 text-center text-[14px] font-black">{calMonth.getFullYear()}년 {calMonth.getMonth() + 1}월</span>
            <button
              type="button"
              aria-label="다음 달"
              disabled={!canNextMonth}
              onClick={() => setCalMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              className="flex h-7 w-7 items-center justify-center rounded-[10px] border transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted }}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7">
            {WEEKDAY_LABELS.map((label, index) => (
              <span
                key={label}
                className="py-1 text-center text-xs font-bold"
                style={{ color: index === 0 ? LEGACY_COLORS.red : index === 6 ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2 }}
              >
                {label}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-0.5">
            {calendarDays(calMonth).map((date) => {
              const dateKey = toDateKey(date);
              const selected = dateKey === value;
              const disabled = isFutureKstDate(dateKey, maxDate);
              const outsideMonth = date.getMonth() !== calMonth.getMonth();
              const dayColor = date.getDay() === 0 ? LEGACY_COLORS.red : date.getDay() === 6 ? LEGACY_COLORS.blue : LEGACY_COLORS.text;
              return (
                <button
                  key={dateKey}
                  type="button"
                  aria-label={dateLabel(date)}
                  aria-pressed={selected}
                  disabled={disabled}
                  onClick={() => {
                    onChange(dateKey);
                    setOpen(false);
                  }}
                  className="flex h-7 items-center justify-center rounded-[10px] text-sm font-bold transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30"
                  style={{
                    background: selected ? tint(LEGACY_COLORS.blue, 16, LEGACY_COLORS.s2) : "transparent",
                    color: outsideMonth ? LEGACY_COLORS.muted2 : selected ? LEGACY_COLORS.blue : dayColor,
                    outline: selected ? `1px solid ${LEGACY_COLORS.blue}` : "none",
                  }}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
          </div>
        )}
      </div>

      <button
        type="button"
        aria-label="다음 날"
        title={canNextDay ? "다음 날" : "미래 날짜는 선택할 수 없습니다."}
        disabled={!canNextDay}
        onClick={() => onChange(nextWorkDate)}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30 lg:h-8 lg:w-8"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted }}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
