"use client";

import { CalendarDays, List, Search, X } from "lucide-react";
import { LEGACY_COLORS } from "../legacyUi";
import { DATE_OPTIONS, TYPE_OPTIONS } from "./historyShared";

function Chip({
  active,
  label,
  onClick,
  tone = LEGACY_COLORS.blue,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  tone?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="whitespace-nowrap rounded-full border px-3 py-1 text-sm font-semibold transition-all hover:brightness-110"
      style={{
        background: active ? `color-mix(in srgb, ${tone} 14%, transparent)` : LEGACY_COLORS.s2,
        borderColor: active ? tone : LEGACY_COLORS.border,
        color: active ? tone : LEGACY_COLORS.muted2,
      }}
    >
      {label}
    </button>
  );
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
  totalCount,
}: Props) {
  return (
    <section className="card" style={{ paddingTop: 14, paddingBottom: 14 }}>
      <div className="flex flex-col gap-2.5">
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
                color: viewMode === "list" ? "#fff" : LEGACY_COLORS.muted2,
              }}
            >
              <List className="h-3.5 w-3.5" />목록
            </button>
            <button
              onClick={() => setViewMode("calendar")}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold transition-colors"
              style={{
                background: viewMode === "calendar" ? LEGACY_COLORS.blue : "transparent",
                color: viewMode === "calendar" ? "#fff" : LEGACY_COLORS.muted2,
              }}
            >
              <CalendarDays className="h-3.5 w-3.5" />달력
            </button>
          </div>
        </div>

        {/* 2줄: 거래 유형 칩 */}
        <div className="flex flex-wrap items-center gap-1.5">
          {TYPE_OPTIONS.map((opt) => (
            <Chip key={opt.value} active={typeFilter === opt.value} label={opt.label} onClick={() => setTypeFilter(opt.value)} />
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
