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

function fmtNum(n: number | string) {
  return Number(n).toLocaleString("ko-KR");
}

// ─── 이번 주 총평 ─────────────────────────────────────────────────
type StatusLevel = "danger" | "neutral" | "good";

function buildStatusReport(data: WeeklyReportResponse): {
  main: string;
  sub: string;
  level: StatusLevel;
} {
  const { summary, warnings } = data;
  if (summary.groups_decreasing > 0) {
    const firstDanger = warnings.find((w) => w.level === "danger");
    return {
      main: "확인 필요한 공정이 있습니다.",
      sub: firstDanger?.message ?? `${summary.groups_decreasing}개 공정 재고 감소`,
      level: "danger",
    };
  }
  if (Number(summary.total_in_qty) === 0 && Number(summary.total_out_qty) === 0) {
    return {
      main: "선택 주차에 집계된 입출고 변동이 없습니다.",
      sub: `현재재고 ${fmtNum(summary.total_current_qty)}`,
      level: "neutral",
    };
  }
  return {
    main: "공정완료품 재고 흐름이 안정적입니다.",
    sub: `현재재고 ${fmtNum(summary.total_current_qty)} · 생산/입고 ${fmtNum(summary.total_in_qty)} · 출고/소비 ${fmtNum(summary.total_out_qty)}`,
    level: "good",
  };
}

// ─── 핵심 지표 카드 데이터 ─────────────────────────────────────────
function buildSummaryCards(data: WeeklyReportResponse) {
  const { summary } = data;
  const needCheck = summary.groups_decreasing;
  return [
    {
      label: "현재 재고",
      sub: "공정완료품 총재고",
      value: fmtNum(summary.total_current_qty),
      color: LEGACY_COLORS.blue,
    },
    {
      label: "생산 / 입고",
      sub: "선택 주차 증가량",
      value: fmtNum(summary.total_in_qty),
      color: Number(summary.total_in_qty) > 0 ? LEGACY_COLORS.cyan : LEGACY_COLORS.muted,
    },
    {
      label: "출고 / 소비",
      sub: "선택 주차 감소량",
      value: fmtNum(summary.total_out_qty),
      color: LEGACY_COLORS.muted,
    },
    {
      label: "확인 필요",
      sub: "감소 공정 기준",
      value: needCheck > 0 ? `${needCheck}개 공정` : "없음",
      color: needCheck > 0 ? LEGACY_COLORS.red : LEGACY_COLORS.muted,
    },
  ] as const;
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
  const summaryCards = data ? buildSummaryCards(data) : null;
  const statusReport = data ? buildStatusReport(data) : null;

  const statusColor =
    statusReport?.level === "danger"
      ? LEGACY_COLORS.red
      : statusReport?.level === "good"
      ? LEGACY_COLORS.green
      : LEGACY_COLORS.muted;

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

  const cardBase = {
    background: LEGACY_COLORS.s1,
    borderColor: LEGACY_COLORS.border,
    boxShadow: "var(--c-card-shadow)",
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden py-1 pr-1">

      {/* ── 1행: 상단 컨트롤 ── */}
      <div
        className="flex shrink-0 items-center justify-between gap-3 rounded-[22px] border px-5 py-3"
        style={cardBase}
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
            최신 데이터 확인
          </button>
          <button
            type="button"
            onClick={handleExcel}
            className="flex h-9 items-center gap-1.5 rounded-[14px] border px-3 text-[13px] font-bold transition-all hover:brightness-95"
            style={{ background: LEGACY_COLORS.blue, borderColor: LEGACY_COLORS.blue, color: LEGACY_COLORS.white }}
          >
            <Download className="h-3.5 w-3.5" />
            엑셀 내보내기
          </button>
        </div>
      </div>

      {/* ── 2행: 이번 주 총평 + 핵심 지표 ── */}
      <div
        className="grid shrink-0 gap-3"
        style={{ gridTemplateColumns: "minmax(0, 1.8fr) repeat(4, minmax(0, 1fr))" }}
      >
        {/* 총평 카드 */}
        {statusReport ? (
          <div
            className="rounded-[18px] border px-5 py-3.5"
            style={{
              ...cardBase,
              borderColor:
                statusReport.level === "danger"
                  ? `color-mix(in srgb, ${LEGACY_COLORS.red} 30%, ${LEGACY_COLORS.border})`
                  : statusReport.level === "good"
                  ? `color-mix(in srgb, ${LEGACY_COLORS.green} 20%, ${LEGACY_COLORS.border})`
                  : LEGACY_COLORS.border,
              background:
                statusReport.level === "danger"
                  ? `color-mix(in srgb, ${LEGACY_COLORS.red} 5%, ${LEGACY_COLORS.s1})`
                  : LEGACY_COLORS.s1,
            }}
          >
            <div className="text-[10px] font-bold" style={{ color: LEGACY_COLORS.muted }}>
              이번 주 총평
            </div>
            <div className="mt-0.5 text-[15px] font-black leading-snug" style={{ color: statusColor }}>
              {statusReport.main}
            </div>
            <div className="mt-1 text-[11px] leading-relaxed" style={{ color: LEGACY_COLORS.muted }}>
              {statusReport.sub}
            </div>
          </div>
        ) : (
          <div
            className="animate-pulse rounded-[18px] border"
            style={{ minHeight: 76, background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
          />
        )}

        {/* 핵심 지표 4개 */}
        {summaryCards
          ? summaryCards.map((card) => (
              <div
                key={card.label}
                className="rounded-[18px] border px-4 py-3"
                style={cardBase}
              >
                <div className="text-[10px] font-bold" style={{ color: LEGACY_COLORS.muted }}>
                  {card.label}
                </div>
                <div className="mt-0.5 text-[20px] font-black leading-tight" style={{ color: card.color }}>
                  {card.value}
                </div>
                <div className="mt-0.5 text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>
                  {card.sub}
                </div>
              </div>
            ))
          : Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-[18px] border"
                style={{ minHeight: 76, background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
              />
            ))}
      </div>

      {/* ── 3행: 본문 ── */}
      <div
        className="min-h-0 flex-1 overflow-hidden"
        style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 12 }}
      >
        {/* 좌: 공정 카드 + 품목 상세 */}
        <div className="flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden">

          {/* 공정별 재고 변화 카드 */}
          <div
            className="shrink-0 rounded-[22px] border p-4"
            style={cardBase}
          >
            <div className="mb-3 flex items-baseline gap-2">
              <h2 className="text-[13px] font-black" style={{ color: LEGACY_COLORS.text }}>
                공정별 재고 변화
              </h2>
              <span className="text-[11px]" style={{ color: LEGACY_COLORS.muted }}>
                TF · HF · VF · NF · AF · PF
              </span>
            </div>
            {loading && !data ? (
              <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="animate-pulse rounded-[18px] border"
                    style={{ height: 92, background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
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

          {/* 품목 상세 */}
          <div
            className="min-h-0 flex-1 overflow-hidden rounded-[22px] border"
            style={{
              ...cardBase,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              className="flex shrink-0 items-center justify-between border-b px-5 py-3"
              style={{ borderColor: LEGACY_COLORS.border }}
            >
              <div>
                <h2 className="text-[13px] font-black" style={{ color: LEGACY_COLORS.text }}>
                  {selectedGroup
                    ? `${selectedGroup.dept_name} (${selectedGroup.process_code}) 품목 상세`
                    : "품목 상세"}
                </h2>
                <p className="mt-0.5 text-[11px]" style={{ color: LEGACY_COLORS.muted }}>
                  {selectedGroup?.label ?? "공정 그룹을 선택하세요"} · 선택 주차 품목별 변화
                </p>
              </div>
              {/* 공정 탭 */}
              <div className="flex flex-wrap justify-end gap-1.5">
                {(data?.groups ?? []).map((g) => (
                  <button
                    key={g.process_code}
                    type="button"
                    onClick={() => setSelectedCode(g.process_code)}
                    className="h-[28px] rounded-full border px-3 text-[11px] font-black transition-all"
                    style={{
                      background:
                        g.process_code === selectedCode ? LEGACY_COLORS.blue : LEGACY_COLORS.s2,
                      borderColor:
                        g.process_code === selectedCode ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
                      color:
                        g.process_code === selectedCode ? LEGACY_COLORS.white : LEGACY_COLORS.muted,
                    }}
                  >
                    {g.dept_name}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-5 pb-4 pt-3">
              <WeeklyDetailTable group={selectedGroup} />
            </div>
          </div>
        </div>

        {/* 우: 확인 사항 */}
        <div className="min-h-0 overflow-hidden">
          <WeeklyKpiPanel data={data ?? undefined} loading={loading && !data} />
        </div>
      </div>
    </div>
  );
}
