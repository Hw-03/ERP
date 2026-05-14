"use client";

import { CalendarDays, List, Search, X } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { FilterChip } from "../common";
import { DATE_OPTIONS, TAB_LABELS, TAB_TYPE_MAP, TYPE_OPTIONS, type HistoryTab } from "./historyShared";

// 탭별로 보여줄 유형 칩 필터링
const WAREHOUSE_TYPE_VALUES = new Set(TAB_TYPE_MAP.WAREHOUSE?.split(","));
const DEPT_TYPE_VALUES = new Set(TAB_TYPE_MAP.DEPT?.split(","));

function getTypeOptionsForTab(tab: HistoryTab) {
  if (tab === "ALL") return TYPE_OPTIONS;
  const allowed = tab === "WAREHOUSE" ? WAREHOUSE_TYPE_VALUES : DEPT_TYPE_VALUES;
  return TYPE_OPTIONS.filter((o) => o.value === "ALL" || allowed.has(o.value));
}

type Props = {
  search: string;
  setSearch: (v: string) => void;
  dateFilter: string;
  setDateFilter: (v: string) => void;
  viewMode: "list" | "calendar";
  setViewMode: (m: "list" | "calendar") => void;
  typeFilter: string;
  setTypeFilter: (v: string) => void;
  historyTab: HistoryTab;
  setHistoryTab: (t: HistoryTab) => void;
  totalCount: number;
};

export function HistoryFilterBar({
  search,
  setSearch,
  dateFilter,
  setDateFilter,
  viewMode,
  setViewMode,
  typeFilter,
  setTypeFilter,
  historyTab,
  setHistoryTab,
  totalCount,
}: Props) {
  const typeOptions = getTypeOptionsForTab(historyTab);

  return (
    <section className="card" style={{ paddingTop: 14, paddingBottom: 14 }}>
      <div className="flex flex-col gap-2.5">
        {/* 0줄: 창고/부서 탭 */}
        <div className="flex overflow-hidden rounded-[12px] border self-start" style={{ borderColor: LEGACY_COLORS.border }}>
          {(["ALL", "WAREHOUSE", "DEPT"] as HistoryTab[]).map((tab) => {
            const active = historyTab === tab;
            return (
              <button
                key={tab}
                onClick={() => { setHistoryTab(tab); setTypeFilter("ALL"); }}
                className="px-4 py-2 text-xs font-bold transition-colors"
                style={{
                  background: active ? LEGACY_COLORS.blue : "transparent",
                  color: active ? LEGACY_COLORS.white : LEGACY_COLORS.muted2,
                }}
              >
                {TAB_LABELS[tab]}
              </button>
            );
          })}
        </div>

        {/* 1줄: 검색 + 기간 세그먼트 + 목록/달력 토글 */}
        <div className="flex items-center gap-2">
          <div
            className="flex flex-1 items-center gap-2 rounded-[12px] border px-3 py-2"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
          >
            <Search className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="품명 · 품목 코드 · 담당자 · 참조번호 · 메모 검색"
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: LEGACY_COLORS.text }}
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>✕</button>
            )}
          </div>

          {/* 기간 세그먼트 */}
          <div className="flex overflow-hidden rounded-[12px] border" style={{ borderColor: LEGACY_COLORS.border }}>
            {DATE_OPTIONS.map((opt) => {
              const active = dateFilter === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setDateFilter(opt.value)}
                  className="px-3 py-2 text-xs font-bold transition-colors"
                  style={{
                    background: active ? `color-mix(in srgb, ${LEGACY_COLORS.purple} 20%, transparent)` : "transparent",
                    color: active ? LEGACY_COLORS.purple : LEGACY_COLORS.muted2,
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* 목록/달력 토글 */}
          <div className="flex overflow-hidden rounded-[12px] border" style={{ borderColor: LEGACY_COLORS.border }}>
            <button
              onClick={() => setViewMode("list")}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold transition-colors"
              style={{
                background: viewMode === "list" ? LEGACY_COLORS.blue : "transparent",
                color: viewMode === "list" ? LEGACY_COLORS.white : LEGACY_COLORS.muted2,
              }}
            >
              <List className="h-3.5 w-3.5" />목록
            </button>
            <button
              onClick={() => setViewMode("calendar")}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold transition-colors"
              style={{
                background: viewMode === "calendar" ? LEGACY_COLORS.blue : "transparent",
                color: viewMode === "calendar" ? LEGACY_COLORS.white : LEGACY_COLORS.muted2,
              }}
            >
              <CalendarDays className="h-3.5 w-3.5" />달력
            </button>
          </div>
        </div>

        {/* 2줄: 거래 유형 칩 (탭 기준 필터링) */}
        <div className="flex flex-wrap items-center gap-1.5">
          {typeOptions.map((opt) => (
            <FilterChip key={opt.value} active={typeFilter === opt.value} label={opt.label} onClick={() => setTypeFilter(opt.value)} size="sm" />
          ))}
        </div>

        {/* 3줄(조건부): 적용된 필터 요약 */}
        {(typeFilter !== "ALL" || dateFilter !== "ALL" || search.trim()) && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>적용됨</span>
            {typeFilter !== "ALL" && (
              <span
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold"
                style={{
                  background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 12%, transparent)`,
                  borderColor: `color-mix(in srgb, ${LEGACY_COLORS.blue} 35%, transparent)`,
                  color: LEGACY_COLORS.blue,
                }}
              >
                유형: {TYPE_OPTIONS.find((opt) => opt.value === typeFilter)?.label}
                <button onClick={() => setTypeFilter("ALL")}><X className="h-3 w-3" /></button>
              </span>
            )}
            {dateFilter !== "ALL" && (
              <span
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold"
                style={{
                  background: `color-mix(in srgb, ${LEGACY_COLORS.purple} 12%, transparent)`,
                  borderColor: `color-mix(in srgb, ${LEGACY_COLORS.purple} 35%, transparent)`,
                  color: LEGACY_COLORS.purple,
                }}
              >
                기간: {DATE_OPTIONS.find((opt) => opt.value === dateFilter)?.label}
                <button onClick={() => setDateFilter("ALL")}><X className="h-3 w-3" /></button>
              </span>
            )}
            {search.trim() && (
              <span
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold"
                style={{
                  background: `color-mix(in srgb, ${LEGACY_COLORS.cyan} 12%, transparent)`,
                  borderColor: `color-mix(in srgb, ${LEGACY_COLORS.cyan} 35%, transparent)`,
                  color: LEGACY_COLORS.cyan,
                }}
              >
                &quot;{search}&quot;
                <button onClick={() => setSearch("")}><X className="h-3 w-3" /></button>
              </span>
            )}
            <span className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>{totalCount}건</span>
          </div>
        )}
      </div>
    </section>
  );
}
