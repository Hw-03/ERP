"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { api } from "@/lib/api";
import type { WeeklyReportResponse } from "@/lib/api/types/weekly";
import { WeeklyGroupCards } from "./_weekly_sections/WeeklyGroupCards";
import { WeeklyDetailTable } from "./_weekly_sections/WeeklyDetailTable";
import { LoadingSkeleton } from "./common/LoadingSkeleton";

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

// ─── 컴포넌트 ──────────────────────────────────────────────────────
export function DesktopWeeklyReportView() {
  const [weekMon, setWeekMon] = useState<Date>(() => getWeekStart(new Date()));
  const [data, setData] = useState<WeeklyReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCode, setSelectedCode] = useState("NF");

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

  function prevWeek() {
    setWeekMon((d) => new Date(d.getTime() - 7 * 86400000));
  }

  function nextWeek() {
    const next = new Date(weekMon.getTime() + 7 * 86400000);
    if (next <= new Date()) setWeekMon(next);
  }

  const isThisWeek = toDateStr(getWeekStart(new Date())) === weekStart;
  const selectedGroup = data?.groups.find((g) => g.process_code === selectedCode);

  const cardBase = {
    background: LEGACY_COLORS.s1,
    borderColor: LEGACY_COLORS.border,
    boxShadow: "var(--c-card-shadow)",
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden py-1 pr-1">

      {/* ── 행1: 컨트롤 바 ── */}
      <div
        className="flex shrink-0 items-center justify-between gap-3 rounded-[22px] border px-5 py-3"
        style={cardBase}
      >
        {/* 주차 네비게이터 */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={prevWeek}
            className="flex h-8 w-8 items-center justify-center rounded-[12px] border transition-colors hover:brightness-110"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted }}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div className="px-1">
            <div className="text-[15px] font-black" style={{ color: LEGACY_COLORS.text }}>
              {weekLabel(weekMon)}
            </div>
          </div>

          <button
            type="button"
            onClick={nextWeek}
            disabled={isThisWeek}
            className="flex h-8 w-8 items-center justify-center rounded-[12px] border transition-colors hover:brightness-110 disabled:opacity-40"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted }}
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          {isThisWeek && (
            <span
              className="ml-1 rounded-full border px-2.5 py-0.5 text-[11px] font-black"
              style={{
                borderColor: `color-mix(in srgb, ${LEGACY_COLORS.green} 30%, ${LEGACY_COLORS.border})`,
                color: LEGACY_COLORS.green,
                background: `color-mix(in srgb, ${LEGACY_COLORS.green} 10%, transparent)`,
              }}
            >
              이번 주
            </span>
          )}
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
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            최신 데이터 확인
          </button>
        </div>
      </div>

      {/* ── 행2: 공정별 변화 카드 ── */}
      <div
        className="shrink-0 rounded-[22px] border p-4"
        style={cardBase}
      >
        <div className="mb-3 flex items-baseline gap-2">
          <h2 className="text-[13px] font-black" style={{ color: LEGACY_COLORS.text }}>
            공정별 변화
          </h2>
          <span className="text-[11px]" style={{ color: LEGACY_COLORS.muted }}>
            순변동 · 생산/입고 · 출고/소비
          </span>
        </div>
        {loading && !data ? (
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-[18px] border"
                style={{ height: 96, background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
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
      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] border"
        style={cardBase}
      >
        {/* 헤더 */}
        <div
          className="flex shrink-0 items-center border-b px-5 py-3"
          style={{ borderColor: LEGACY_COLORS.border }}
        >
          <div>
            <h2 className="text-[13px] font-black" style={{ color: LEGACY_COLORS.text }}>
              {selectedGroup
                ? `${selectedGroup.dept_name} (${selectedGroup.process_code}) 품목 상세`
                : "품목 상세"}
            </h2>
            <p className="mt-0.5 text-[11px]" style={{ color: LEGACY_COLORS.muted }}>
              {selectedGroup?.label ?? "공정을 선택하세요"} · 선택 주차 품목별 변화
            </p>
          </div>
        </div>

        {/* 바디: 테이블 */}
        <div className="min-h-0 flex-1 overflow-auto px-5 pb-4 pt-3">
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
