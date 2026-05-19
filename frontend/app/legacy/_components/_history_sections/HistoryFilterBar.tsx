"use client";

import { Search, X } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { FilterChip } from "../common";
import { DATE_OPTIONS, TYPE_OPTIONS, typeChipsForBucket } from "./historyQuery";

// scope(창고/부서/수량조정)는 상단 HistoryStatsBar 박스가 담당.
// 거래 유형 칩은 activeBucket 에 종속 — 박스 미선택/수량조정이면 칩 줄 숨김 (#6/#8).
type Props = {
  search: string;
  setSearch: (v: string) => void;
  dateFilter: string;
  setDateFilter: (v: string) => void;
  typeFilter: string;
  setTypeFilter: (v: string) => void;
  /** 상단 KPI 박스 상태 — 'all'|'warehouse'|'dept'|'adjust'. */
  activeBucket: string;
  totalCount: number;
};

export function HistoryFilterBar({
  search,
  setSearch,
  dateFilter,
  setDateFilter,
  typeFilter,
  setTypeFilter,
  activeBucket,
  totalCount,
}: Props) {
  const typeChips = typeChipsForBucket(activeBucket);
  return (
    <section className="card" style={{ paddingTop: 14, paddingBottom: 14 }}>
      <div className="flex flex-col gap-2.5">
        {/* 1줄: 검색 + 기간 세그먼트 */}
        <div className="flex items-center gap-2">
          <div
            className="flex flex-1 items-center gap-2 rounded-[12px] border px-3 py-2"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
          >
            <Search className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="품명 · 코드 · 담당자 · 참조번호 · 메모"
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: LEGACY_COLORS.text }}
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                ✕
              </button>
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

        </div>

        {/* 2줄: 거래 유형 칩 — activeBucket 종속. 빈 목록이면 줄 자체 숨김. */}
        {typeChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {typeChips.map((opt) => (
              <FilterChip
                key={opt.value}
                active={typeFilter === opt.value}
                label={opt.label}
                onClick={() => setTypeFilter(opt.value)}
                size="sm"
              />
            ))}
          </div>
        )}

        {/* 3줄(조건부): 적용된 필터 요약 */}
        {(typeFilter !== "ALL" || dateFilter !== "ALL" || search.trim()) && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>적용됨</span>
            {/* ADJUST 등 KPI 박스 구동 필터는 상단 박스/칩이 담당 → 여기선 표시 안 함 */}
            {typeFilter !== "ALL" && TYPE_OPTIONS.some((opt) => opt.value === typeFilter) && (
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
