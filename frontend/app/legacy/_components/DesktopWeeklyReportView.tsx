"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { api } from "@/lib/api";
import type { WeeklyReportResponse } from "@/lib/api/types/weekly";
import { tint } from "@/lib/mes/colorUtils";
import { WeeklyGroupCards } from "./_weekly_sections/WeeklyGroupCards";
import { WeeklyDetailTable } from "./_weekly_sections/WeeklyDetailTable";
import { WeeklyProductionMatrix } from "./_weekly_sections/WeeklyProductionMatrix";
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

function getWeekStartSun(d: Date): Date {
  const sun = new Date(d);
  sun.setDate(d.getDate() - d.getDay());
  sun.setHours(0, 0, 0, 0);
  return sun;
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

// ─── 컴포넌트 ──────────────────────────────────────────────────────
export function DesktopWeeklyReportView() {
  const [weekMon, setWeekMon] = useState<Date>(() => getWeekStart(new Date()));
  const [data, setData] = useState<WeeklyReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCode, setSelectedCode] = useState("TF");

  const [calOpen, setCalOpen] = useState(false);
  const [hoveredWeek, setHoveredWeek] = useState<string | null>(null);
  const [calMonth, setCalMonth] = useState<Date>(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });
  const calRef = useRef<HTMLDivElement>(null);

  const weekStart = toDateStr(weekMon);
  const weekEnd = toDateStr(new Date(weekMon.getTime() + 6 * 86400000));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getWeeklyReport({ week_start: weekStart, week_end: weekEnd })
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setSelectedCode((prev) => {
          if (res.groups.length > 0 && !res.groups.find((g) => g.process_code === prev)) {
            return res.groups[0].process_code;
          }
          return prev;
        });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError("주간보고 데이터를 불러오지 못했습니다.");
          console.error(e);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
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
    <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4 py-1 pr-1">

      {/* ── 행1: 주차 선택 (달력 아코디언) ── */}
      <div
        className="shrink-0 rounded-[22px] border"
        style={cardBase}
        ref={calRef}
      >
        {/* 트리거 행 */}
        <div className="flex items-center justify-between px-5 py-3">
          <button
            type="button"
            onClick={() => setCalOpen((v) => !v)}
            className="flex items-center gap-2 rounded-[14px] border px-4 py-2.5 transition-colors hover:brightness-110"
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
            <span className="text-[11px] font-bold" style={{ color: LEGACY_COLORS.muted }}>
              기준 주차
            </span>
            <span className="text-[15px] font-black">{weekLabel(weekMon)}</span>
            <ChevronRight
              className="h-4 w-4 shrink-0 transition-transform"
              style={{
                color: LEGACY_COLORS.muted,
                transform: calOpen ? "rotate(90deg)" : "rotate(0deg)",
              }}
            />
          </button>
          <div className="flex items-center gap-2">
            {isThisWeek && <StatusPill label="이번 주" tone="success" showDot={false} />}
            {error && (
              <span className="text-[12px]" style={{ color: LEGACY_COLORS.red }}>
                {error}
              </span>
            )}
          </div>
        </div>

        {/* 달력 아코디언 */}
        <div
          className="overflow-hidden"
          style={{
            maxHeight: calOpen ? 960 : 0,
            opacity: calOpen ? 1 : 0,
            transition: "max-height 260ms cubic-bezier(0.4,0,0.2,1), opacity 200ms ease",
          }}
        >
          <div
            className="border-t px-5 pb-5 pt-4"
            style={{ borderColor: LEGACY_COLORS.border }}
          >
            {/* 월 헤더 */}
            <div className="mb-4 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() =>
                  setCalMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))
                }
                disabled={!canPrevMonth}
                className="flex h-8 w-8 items-center justify-center rounded-[10px] border transition-colors hover:brightness-110 disabled:opacity-30"
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
                className="flex h-8 w-8 items-center justify-center rounded-[10px] border transition-colors hover:brightness-110 disabled:opacity-30"
                style={{
                  background: LEGACY_COLORS.s2,
                  borderColor: LEGACY_COLORS.border,
                  color: LEGACY_COLORS.muted,
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

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

            {/* 날짜 셀 그리드 */}
            <div className="grid grid-cols-7 gap-1">
              {getWeeksOfMonth(calMonth.getFullYear(), calMonth.getMonth()).flatMap((week) => {
                const sun = week[0];
                const mon = new Date(sun.getTime() + 86400000);
                const weekKey = toDateStr(mon);
                const isSelectedWeek = weekKey === weekStart;
                const isHovered = hoveredWeek === weekKey;
                const isFuture = toDateStr(mon) > toDateStr(getWeekStart(new Date()));
                return week.map((d) => {
                  const isOutside = d.getMonth() !== calMonth.getMonth();
                  return (
                    <button
                      key={d.toISOString()}
                      onClick={() => {
                        if (!isFuture) {
                          setWeekMon(new Date(mon));
                          setCalOpen(false);
                        }
                      }}
                      onMouseEnter={() => !isFuture && setHoveredWeek(weekKey)}
                      onMouseLeave={() => setHoveredWeek(null)}
                      disabled={isFuture}
                      className="flex flex-col items-center rounded-[10px] border px-1 py-2 transition-colors disabled:opacity-30"
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
                      <span
                        className="text-sm font-bold"
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
                    </button>
                  );
                });
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── 행2: 생산 현황 (빈 상태는 얇은 노트로 축소) ── */}
      {(() => {
        if (loading && !data) {
          return (
            <div className="shrink-0 rounded-[18px] border py-3.5 px-4" style={cardBase}>
              <LoadingSkeleton variant="card" rows={1} />
            </div>
          );
        }
        const rows = data?.production_matrix ?? [];
        const hasProduction = rows.some((r) => r.total_qty > 0);
        if (!hasProduction) {
          return (
            <div
              className="flex shrink-0 items-center justify-between rounded-[12px] border px-4 py-2"
              style={cardBase}
            >
              <span
                className="text-[11px] font-bold tracking-wide"
                style={{ color: LEGACY_COLORS.muted }}
              >
                생산 현황
              </span>
              <span
                className="text-[12px]"
                style={{ color: LEGACY_COLORS.muted2 }}
              >
                이번 주 생산 실적 없음 · 모델별 공정 생산 기록이 없습니다.
              </span>
            </div>
          );
        }
        return (
          <div className="shrink-0 rounded-[18px] border py-3.5 px-4" style={cardBase}>
            <div className="mb-2.5 flex items-baseline gap-2">
              <h2 className="text-[15px] font-black" style={{ color: LEGACY_COLORS.text }}>
                생산 현황
              </h2>
              <span className="text-[12px]" style={{ color: LEGACY_COLORS.muted }}>
                선택 주차 모델별 공정 생산 수량
              </span>
            </div>
            <WeeklyProductionMatrix rows={rows} />
          </div>
        );
      })()}

      {/* ── 행3: 2-column (공정별 변화 | 품목 상세) ── */}
      <div className="flex gap-4">

        {/* 좌: 공정별 변화 */}
        <div
          className="flex w-[330px] shrink-0 flex-col rounded-[18px] border"
          style={cardBase}
        >
          <div
            className="shrink-0 border-b px-4 pb-3 pt-3.5"
            style={{ borderColor: LEGACY_COLORS.border }}
          >
            <h2 className="text-[15px] font-black" style={{ color: LEGACY_COLORS.text }}>
              공정별 변화
            </h2>
            <p className="mt-0.5 text-[12px]" style={{ color: LEGACY_COLORS.muted }}>
              순변동 · 생산 내역 · 출고 내역
            </p>
          </div>
          <div className="p-3">
            {loading && !data ? (
              <LoadingSkeleton variant="card" rows={4} />
            ) : (
              <WeeklyGroupCards
                groups={data?.groups ?? []}
                selected={selectedCode}
                onSelect={setSelectedCode}
                cols={1}
              />
            )}
          </div>
        </div>

        {/* 우: 품목 상세 — relative wrapper가 행 높이(= 좌측 카드)를 따르고, 내부 absolute 카드가 그 높이를 꽉 채움 */}
        <div className="relative flex-1">
          <div
            className="absolute inset-0 flex flex-col rounded-[18px] border"
            style={cardBase}
          >
            <div
              className="shrink-0 border-b px-5 py-3"
              style={{ borderColor: LEGACY_COLORS.border }}
            >
              <h2 className="text-[15px] font-black" style={{ color: LEGACY_COLORS.text }}>
                {selectedGroup ? `${selectedGroup.dept_name} 품목 상세` : "품목 상세"}
              </h2>
              <p className="mt-0.5 text-[13px]" style={{ color: LEGACY_COLORS.muted }}>
                {selectedGroup?.label ?? "공정을 선택하세요"} · 선택 주차 품목별 변화
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-3">
              {loading && !data ? (
                <LoadingSkeleton variant="list" rows={8} />
              ) : (
                <WeeklyDetailTable group={selectedGroup} />
              )}
            </div>
            <div
              className="shrink-0 border-t px-5 py-2.5 text-[11px]"
              style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
            >
              전주 재고는 현재 재고와 선택 주차 입출고 내역을 기준으로 계산한 값입니다.
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
