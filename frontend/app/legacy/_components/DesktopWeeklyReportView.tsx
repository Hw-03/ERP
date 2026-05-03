"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, RefreshCw } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { api } from "@/lib/api";
import type { WeeklyReportResponse } from "@/lib/api/types/weekly";
import { toApiUrl } from "@/lib/api-core";
import { WeeklyGroupCards } from "./_weekly_sections/WeeklyGroupCards";
import { WeeklyDetailTable } from "./_weekly_sections/WeeklyDetailTable";
import { WeeklyKpiPanel } from "./_weekly_sections/WeeklyKpiPanel";

// ─── 주차 계산 헬퍼 ────────────────────────────────────────────────
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
        // 선택 그룹이 없으면 첫 번째 그룹으로 초기화
        if (res.groups.length > 0 && !res.groups.find((g) => g.process_code === selectedCode)) {
          setSelectedCode(res.groups[0].process_code);
        }
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "데이터를 불러오지 못했습니다.");
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

  function handleExcel() {
    const F_CODES = ["TF", "HF", "VF", "NF", "AF", "PF"];
    const params = new URLSearchParams({
      start_date: weekStart,
      end_date: weekEnd,
    });
    F_CODES.forEach((c) => params.append("process_type_code", c));
    const url = toApiUrl(`/api/inventory/transactions/export.xlsx?${params.toString()}`);
    window.open(url, "_blank");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden py-1 pr-1">
      {/* ── 상단 컨트롤 ── */}
      <div
        className="flex shrink-0 items-center justify-between gap-3 rounded-[22px] border px-5 py-3"
        style={{
          background: LEGACY_COLORS.s1,
          borderColor: LEGACY_COLORS.border,
          boxShadow: "var(--c-card-shadow)",
        }}
      >
        {/* 주차 네비게이터 */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={prevWeek}
            className="flex h-8 w-8 items-center justify-center rounded-[12px] border transition-all hover:brightness-95"
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
            className="flex h-8 w-8 items-center justify-center rounded-[12px] border transition-all hover:brightness-95 disabled:opacity-40"
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

        {/* 버튼 영역 */}
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
            className="flex h-9 items-center gap-1.5 rounded-[14px] border px-3 text-[13px] font-bold transition-all hover:brightness-95 disabled:opacity-50"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            새로고침
          </button>
          <button
            type="button"
            onClick={handleExcel}
            className="flex h-9 items-center gap-1.5 rounded-[14px] border px-3 text-[13px] font-bold transition-all hover:brightness-95"
            style={{ background: LEGACY_COLORS.blue, borderColor: LEGACY_COLORS.blue, color: "#ffffff" }}
          >
            <Download className="h-3.5 w-3.5" />
            엑셀 내보내기
          </button>
        </div>
      </div>

      {/* ── 콘텐츠 영역 ── */}
      <div
        className="min-h-0 flex-1 overflow-hidden"
        style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 12 }}
      >
        {/* 좌: 카드 + 상세 테이블 */}
        <div className="flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden">
          {/* 그룹 카드 */}
          <div
            className="shrink-0 rounded-[22px] border p-4"
            style={{
              background: LEGACY_COLORS.s1,
              borderColor: LEGACY_COLORS.border,
              boxShadow: "var(--c-card-shadow)",
            }}
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-[15px] font-black" style={{ color: LEGACY_COLORS.text }}>
                  부서별 최종 산출물 재고 변화
                </h2>
                <p className="mt-0.5 text-[12px]" style={{ color: LEGACY_COLORS.muted }}>
                  ?F 코드군 중심 요약
                </p>
              </div>
            </div>
            {loading && !data ? (
              <div
                className="grid gap-2.5"
                style={{ gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }}
              >
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="animate-pulse rounded-[20px] border"
                    style={{
                      height: 128,
                      background: LEGACY_COLORS.s2,
                      borderColor: LEGACY_COLORS.border,
                    }}
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

          {/* 상세 테이블 */}
          <div
            className="min-h-0 flex-1 overflow-hidden rounded-[22px] border"
            style={{
              background: LEGACY_COLORS.s1,
              borderColor: LEGACY_COLORS.border,
              boxShadow: "var(--c-card-shadow)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              className="flex shrink-0 items-center justify-between border-b px-5 py-3"
              style={{ borderColor: LEGACY_COLORS.border }}
            >
              <div>
                <h2 className="text-[15px] font-black" style={{ color: LEGACY_COLORS.text }}>
                  {selectedGroup
                    ? `${selectedGroup.dept_name} ${selectedGroup.process_code} 상세`
                    : "상세 테이블"}
                </h2>
                <p className="mt-0.5 text-[12px]" style={{ color: LEGACY_COLORS.muted }}>
                  {selectedGroup?.label ?? "공정 그룹을 선택하세요"} · 품목별 주간 변화
                </p>
              </div>
              {/* 탭 버튼 */}
              <div className="flex gap-1.5 flex-wrap justify-end">
                {(data?.groups ?? []).map((g) => (
                  <button
                    key={g.process_code}
                    type="button"
                    onClick={() => setSelectedCode(g.process_code)}
                    className="h-[30px] rounded-full border px-3 text-[11px] font-black transition-all"
                    style={{
                      background:
                        g.process_code === selectedCode ? LEGACY_COLORS.blue : LEGACY_COLORS.s1,
                      borderColor:
                        g.process_code === selectedCode ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
                      color:
                        g.process_code === selectedCode ? "#ffffff" : LEGACY_COLORS.muted,
                    }}
                  >
                    {g.dept_name} {g.process_code}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-5 pb-5 pt-3">
              <WeeklyDetailTable group={selectedGroup} />
            </div>
          </div>
        </div>

        {/* 우: KPI + 특이사항 */}
        <div className="min-h-0 overflow-hidden">
          <WeeklyKpiPanel data={data ?? undefined} loading={loading && !data} />
        </div>
      </div>
    </div>
  );
}
