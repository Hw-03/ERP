"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TransactionLog } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "../../tokens";
import { IconButton } from "../../primitives";
import { HistoryLogRow } from "./HistoryLogRow";

/**
 * mobile HistoryScreen 의 달력 뷰 (월 네비 + 달력 그리드 + 선택일 로그 패널).
 *
 * Round-10B (#5) 추출. 약 178줄짜리 단일 블록을 sub-component 로 분리.
 * 달력 cell 의 in/out/adj 점, today 강조, 선택일 모달은 모두 그대로.
 */

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const LEGEND: [string, string][] = [
  [LEGACY_COLORS.green, "입고/생산"],
  [LEGACY_COLORS.red, "출고/차감"],
  [LEGACY_COLORS.yellow, "조정"],
];

interface Props {
  calendarYear: number;
  calendarMonth: number;
  calendarDays: (number | null)[];
  calendarDayMap: Map<string, TransactionLog[]>;
  calendarLoading: boolean;
  selectedDay: string | null;
  setSelectedDay: (day: string | null) => void;
  todayKey: string;
  copiedRef: string | null;
  onCopy: (ref: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

export function HistoryCalendarView({
  calendarYear,
  calendarMonth,
  calendarDays,
  calendarDayMap,
  calendarLoading,
  selectedDay,
  setSelectedDay,
  todayKey,
  copiedRef,
  onCopy,
  onPrevMonth,
  onNextMonth,
}: Props) {
  const selectedDayLogs = selectedDay ? calendarDayMap.get(selectedDay) ?? [] : [];

  return (
    <>
      <div
        className="flex items-center justify-between rounded-[14px] border px-4 py-2"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        <IconButton
          icon={ChevronLeft}
          label="이전 달"
          size="sm"
          onClick={onPrevMonth}
          color={LEGACY_COLORS.muted2}
        />
        <div className={`${TYPO.title} font-black`} style={{ color: LEGACY_COLORS.text }}>
          {calendarYear}년 {calendarMonth + 1}월
        </div>
        <IconButton
          icon={ChevronRight}
          label="다음 달"
          size="sm"
          onClick={onNextMonth}
          color={LEGACY_COLORS.muted2}
        />
      </div>

      {calendarLoading ? (
        <div className={`${TYPO.body} py-10 text-center`} style={{ color: LEGACY_COLORS.muted2 }}>
          달력 데이터를 불러오는 중…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-7">
            {WEEKDAYS.map((d, i) => (
              <div
                key={d}
                className={`${TYPO.caption} py-1 text-center font-bold`}
                style={{
                  color: i === 0 ? LEGACY_COLORS.red : i === 6 ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2,
                }}
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, idx) => {
              if (day === null) return <div key={`empty-${idx}`} />;
              const key = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const dayLogs = calendarDayMap.get(key) ?? [];
              const isToday = key === todayKey;
              const selected = key === selectedDay;
              const has = dayLogs.length > 0;
              const typeSet = new Set(
                dayLogs.map((l) => {
                  if (l.transaction_type === "RECEIVE" || l.transaction_type === "PRODUCE") return "in";
                  if (l.transaction_type === "SHIP" || l.transaction_type === "BACKFLUSH") return "out";
                  return "adj";
                }),
              );
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDay(selected ? null : key)}
                  className="flex min-h-[52px] flex-col items-center rounded-[10px] p-1"
                  style={{
                    background: selected
                      ? LEGACY_COLORS.blue
                      : isToday
                        ? `${LEGACY_COLORS.blue as string}20`
                        : has
                          ? LEGACY_COLORS.s2
                          : "transparent",
                    border:
                      isToday && !selected
                        ? `1.5px solid ${LEGACY_COLORS.blue}`
                        : "1.5px solid transparent",
                  }}
                >
                  <span
                    className={`${TYPO.caption} font-bold`}
                    style={{
                      color: selected
                        ? "#fff"
                        : idx % 7 === 0
                          ? LEGACY_COLORS.red
                          : idx % 7 === 6
                            ? LEGACY_COLORS.blue
                            : LEGACY_COLORS.text,
                    }}
                  >
                    {day}
                  </span>
                  {has ? (
                    <>
                      <span
                        className={`${TYPO.caption} mt-[2px] rounded-full px-[5px] font-black`}
                        style={{
                          background: selected ? "rgba(255,255,255,.25)" : `${LEGACY_COLORS.blue as string}22`,
                          color: selected ? "#fff" : LEGACY_COLORS.blue,
                        }}
                      >
                        {dayLogs.length}
                      </span>
                      <div className="mt-[2px] flex gap-[2px]">
                        {typeSet.has("in") && (
                          <div className="h-[4px] w-[4px] rounded-full" style={{ background: LEGACY_COLORS.green }} />
                        )}
                        {typeSet.has("out") && (
                          <div className="h-[4px] w-[4px] rounded-full" style={{ background: LEGACY_COLORS.red }} />
                        )}
                        {typeSet.has("adj") && (
                          <div className="h-[4px] w-[4px] rounded-full" style={{ background: LEGACY_COLORS.yellow }} />
                        )}
                      </div>
                    </>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3 px-1">
            {LEGEND.map(([color, label]) => (
              <div key={label} className="flex items-center gap-1">
                <div className="h-[6px] w-[6px] rounded-full" style={{ background: color }} />
                <span className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
                  {label}
                </span>
              </div>
            ))}
          </div>

          {selectedDay ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className={`${TYPO.body} font-black`} style={{ color: LEGACY_COLORS.text }}>
                  {new Date(selectedDay + "T00:00:00").toLocaleDateString("ko-KR", {
                    month: "long",
                    day: "numeric",
                    weekday: "short",
                  })}{" "}
                  · {selectedDayLogs.length}건
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDay(null)}
                  className={`${TYPO.caption}`}
                  style={{ color: LEGACY_COLORS.muted2 }}
                >
                  닫기
                </button>
              </div>
              <div
                className="overflow-hidden rounded-[20px] border"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
              >
                {selectedDayLogs.map((log, idx) => (
                  <div
                    key={log.log_id}
                    style={{
                      borderBottom:
                        idx === selectedDayLogs.length - 1
                          ? "none"
                          : `1px solid ${LEGACY_COLORS.border}`,
                    }}
                  >
                    <HistoryLogRow log={log} copiedRef={copiedRef} onCopy={onCopy} />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
