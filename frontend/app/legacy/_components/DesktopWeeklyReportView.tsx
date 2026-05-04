"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { api } from "@/lib/api";
import type { WeeklyReportResponse } from "@/lib/api/types/weekly";
import { tint } from "@/lib/mes/colorUtils";
import { WeeklyGroupCards } from "./_weekly_sections/WeeklyGroupCards";
import { WeeklyDetailTable } from "./_weekly_sections/WeeklyDetailTable";
import { WeeklySummaryBand } from "./_weekly_sections/WeeklySummaryBand";
import { LoadingSkeleton, StatusPill } from "./common";

// ─── 주차 계산 ────────────────────────────────────────────────────
function getWeekStart(d: Date): Date {
  const mon = new Date(d);
  const dow = d.getDay();
  mon.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getISOWeek(d: Date): number {
  const thu = new Date(d);
  thu.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 3);
  const jan4 = new Date(thu.getFullYear(), 0, 4);
  return 1 + Math.round((thu.getTime() - jan4.getTime()) / 604800000);
}

function weekLabel(mon: Date): string {
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const week = getISOWeek(mon);
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  return `${mon.getFullYear()}년 ${week}주차 (${fmt(mon)} ~ ${fmt(sun)})`;
}

const CAL_MIN = new Date(2026, 0, 1);

function getWeeksOfMonth(year: number, month: number): Date[][] {
  const start = getWeekStart(new Date(year, month, 1));
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

// ─── 컴포넌트 ──────────────────────────────────────────────────────
export function DesktopWeeklyReportView() {
  const [weekMon, setWeekMon] = useState<Date>(() => getWeekStart(new Date()));
  const [data, setData] = useState<WeeklyReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCode, setSelectedCode] = useState("NF");

  const [calOpen, setCalOpen] = useState(false);
  const [calMonth, setCalMonth] = useState<Date>(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });
  const calRef = useRef<HTMLDivElement>(null);

  const weekStart = toDateStr(weekMon);
  const weekEnd = toDateStr(new Date(weekMon.getTime() + 6 * 86400000));

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .getWeeklyReport({ week_start: weekStart, week_end: weekEnd })
      .then((res) => {
        setData(res);
        if (res.groups.length > 0 && !res.groups.find((g) => g.process_code === selectedCode)) {
          setSelectedCode(res.groups[0].process_code);
        }
      })
      .catch((e: unknown) => {
        setError("주간보고 데이터를 불러오지 못했습니다.");
        console.error(e);
      })
      .finally(() => setLoading(false));
  }, [weekStart, weekEnd, selectedCode]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, weekEnd]);

  useEffect(() => {
    if (!calOpen) return;
    function handler(e: MouseEvent) {
      if (calRef.current && !calRef.current.contains(e.target as Node)) setCalOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [calOpen]);

  const isThisWeek = toDateStr(getWeekStart(new Date())) === weekStart;
  const selectedGroup = data?.groups.find((g) => g.process_code === selectedCode);

  const today = new Date();
  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const canPrevMonth = calMonth > CAL_MIN;
  const canNextMonth = calMonth < thisMonthStart;

  const cardBase = {
    background: LEGACY_COLORS.s1,
    borderColor: LEGACY_COLORS.border,
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto py-1 pr-1">

      {/* ── 행1: 컨트롤 바 ── */}
      <div
        className="flex shrink-0 items-center justify-between gap-3 rounded-[22px] border px-5 py-3"
        style={cardBase}
      >
        <div className="flex items-center gap-2">
          {/* 달력 피커 */}
          <div className="relative" ref={calRef}>
            {/* 트리거 버튼 */}
            <button
              type="button"
              onClick={() => setCalOpen((v) => !v)}
              className="flex items-center gap-2 rounded-[14px] border px-4 py-2 transition-colors hover:brightness-110"
              style={{
                background: calOpen
                  ? tint(LEGACY_COLORS.blue, 10, LEGACY_COLORS.s2)
                  : LEGACY_COLORS.s2,
                borderColor: calOpen ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
                color: LEGACY_COLORS.text,
              }}
            >
              <CalendarDays
                className="h-4 w-4 shrink-0"
                style={{ color: LEGACY_COLORS.blue }}
              />
              <span className="text-[15px] font-black">{weekLabel(weekMon)}</span>
            </button>

            {/* 달력 드롭다운 */}
            <div
              className="absolute left-0 top-full z-30 mt-2 overflow-hidden rounded-[20px] border"
              style={{
                background: LEGACY_COLORS.s1,
                borderColor: LEGACY_COLORS.border,
                width: 308,
                maxHeight: calOpen ? 360 : 0,
                opacity: calOpen ? 1 : 0,
                pointerEvents: calOpen ? "auto" : "none",
                transition: "max-height 220ms cubic-bezier(0.4,0,0.2,1), opacity 180ms ease",
              }}
            >
              <div className="p-4">
                {/* 월 헤더 */}
                <div className="mb-3 flex items-center justify-between">
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
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span
                    className="text-[13px] font-black"
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
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* 요일 헤더 */}
                <div className="mb-1 grid grid-cols-7 text-center">
                  {["월", "화", "수", "목", "금", "토", "일"].map((d) => (
                    <span
                      key={d}
                      className="text-[10px] font-bold"
                      style={{ color: LEGACY_COLORS.muted2 }}
                    >
                      {d}
                    </span>
                  ))}
                </div>

                {/* 주 행 */}
                {getWeeksOfMonth(calMonth.getFullYear(), calMonth.getMonth()).map((week) => {
                  const mon = week[0];
                  const isSelected = toDateStr(mon) === weekStart;
                  const isFuture =
                    toDateStr(mon) > toDateStr(getWeekStart(new Date()));
                  return (
                    <div
                      key={mon.toISOString()}
                      role="button"
                      tabIndex={isFuture ? -1 : 0}
                      onClick={() => {
                        if (!isFuture) {
                          setWeekMon(new Date(mon));
                          setCalOpen(false);
                        }
                      }}
                      className="grid grid-cols-7 rounded-[10px] py-1 text-center text-[12px]"
                      style={{
                        background: isSelected
                          ? tint(LEGACY_COLORS.blue, 18)
                          : "transparent",
                        opacity: isFuture ? 0.3 : 1,
                        cursor: isFuture ? "default" : "pointer",
                      }}
                    >
                      {week.map((d) => (
                        <span
                          key={d.toISOString()}
                          style={{
                            color:
                              d.getMonth() !== calMonth.getMonth()
                                ? LEGACY_COLORS.muted2
                                : isSelected
                                ? LEGACY_COLORS.blue
                                : LEGACY_COLORS.text,
                            fontWeight: isSelected ? 700 : 400,
                          }}
                        >
                          {d.getDate()}
                        </span>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 이번 주 배지 */}
          {isThisWeek && <StatusPill label="이번 주" tone="success" showDot={false} />}
        </div>

        {/* 새로고침 */}
        <div className="flex items-center gap-2">
          {error && (
            <span className="text-[12px]" style={{ color: LEGACY_COLORS.red }}>
              {error}
            </span>
          )}
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex h-9 items-center gap-1.5 rounded-[14px] border px-3 text-[13px] font-bold transition-colors hover:brightness-110 disabled:opacity-50"
            style={{
              background: LEGACY_COLORS.s2,
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.muted,
            }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            최신 데이터 확인
          </button>
        </div>
      </div>

      {/* ── 행1.5: 이번 주 총평 ── */}
      {data && <WeeklySummaryBand data={data} />}

      {/* ── 행2: 공정별 변화 카드 ── */}
      <div className="shrink-0 rounded-[22px] border p-4" style={cardBase}>
        <div className="mb-3 flex items-baseline gap-2">
          <h2 className="text-[14px] font-black" style={{ color: LEGACY_COLORS.text }}>
            공정별 변화
          </h2>
          <span className="text-[12px]" style={{ color: LEGACY_COLORS.muted }}>
            순변동 · 생산/입고 · 출고/소비
          </span>
        </div>
        {loading && !data ? (
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-[16px] border"
                style={{ height: 72, background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
              />
            ))}
          </div>
        ) : (
          <WeeklyGroupCards
            groups={data?.groups ?? []}
            selected={selectedCode}
            onSelect={setSelectedCode}
          />
        )}
      </div>

      {/* ── 행3: 품목 상세 카드 ── */}
      <div className="flex flex-col rounded-[22px] border" style={cardBase}>
        {/* 헤더 */}
        <div
          className="flex shrink-0 items-center border-b px-5 py-3"
          style={{ borderColor: LEGACY_COLORS.border }}
        >
          <div>
            <h2 className="text-[14px] font-black" style={{ color: LEGACY_COLORS.text }}>
              {selectedGroup
                ? `${selectedGroup.dept_name} (${selectedGroup.process_code}) 품목 상세`
                : "품목 상세"}
            </h2>
            <p className="mt-0.5 text-[12px]" style={{ color: LEGACY_COLORS.muted }}>
              {selectedGroup?.label ?? "공정을 선택하세요"} · 선택 주차 품목별 변화
            </p>
          </div>
        </div>

        {/* 바디: 테이블 */}
        <div className="px-5 pb-4 pt-3">
          {loading && !data ? (
            <LoadingSkeleton variant="list" rows={8} />
          ) : (
            <WeeklyDetailTable group={selectedGroup} />
          )}
        </div>

        {/* 푸터 */}
        <div
          className="shrink-0 border-t px-5 py-2.5 text-[10px]"
          style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
        >
          전주재고는 현재재고와 선택 주차 입출고 내역을 기준으로 계산한 값입니다.
        </div>
      </div>
    </div>
  );
}
