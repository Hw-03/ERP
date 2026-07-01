"use client";

import { CalendarDays, ChevronDown, Filter, Search, X } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { DATE_OPTIONS } from "./historyQuery";

// 3차 C8: 상단 컨트롤 한 줄 통합 — [검색][기간][필터][달력] + 선택날짜 칩.
// 거래 유형 칩 줄·"적용됨" 요약 줄은 폐기(거래 종류 = "필터" 패널 카드).
// 필터 패널 3카드·달력 strip 은 이 줄 아래 전체폭으로 드롭(부모가 렌더).
type Props = {
  search: string;
  setSearch: (v: string) => void;
  dateFilter: string;
  setDateFilter: (v: string) => void;
  filterPanelOpen: boolean;
  onToggleFilterPanel: () => void;
  /** selectedDepts+selectedModels+selectedOps 합 — 필터 버튼 배지. */
  activeFilterCount: number;
  calendarOpen: boolean;
  onToggleCalendar: () => void;
  /** 달력에서 고른 날짜(YYYY-MM-DD). null = 미선택. */
  selectedDay: string | null;
  onClearSelectedDay: () => void;
};

export function HistoryFilterBar({
  search,
  setSearch,
  dateFilter,
  setDateFilter,
  filterPanelOpen,
  onToggleFilterPanel,
  activeFilterCount,
  calendarOpen,
  onToggleCalendar,
  selectedDay,
  onClearSelectedDay,
}: Props) {
  return (
    <section className="card" style={{ paddingTop: 14, paddingBottom: 14 }}>
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="flex min-h-[44px] flex-1 items-center gap-2 rounded-[12px] border px-3 py-2 lg:min-h-0"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <Search className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="품명 · 코드 · 담당자 · 메모"
            className="h-11 flex-1 bg-transparent text-sm outline-none lg:h-auto"
            style={{ color: LEGACY_COLORS.text }}
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              ✕
            </button>
          )}
        </div>

        {/* 선택 날짜 칩 — 달력 접혀 있어도 항상 노출(활성 필터 정직 표기). */}
        {selectedDay && (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 12%, transparent)`,
              borderColor: `color-mix(in srgb, ${LEGACY_COLORS.blue} 35%, transparent)`,
              color: LEGACY_COLORS.blue,
            }}
          >
            선택: {selectedDay}
            <button type="button" aria-label="선택 날짜 해제" onClick={onClearSelectedDay}>
              <X className="h-3 w-3" />
            </button>
          </span>
        )}

        {/* 기간 세그먼트 */}
        <div className="flex shrink-0 overflow-hidden rounded-[12px] border" style={{ borderColor: LEGACY_COLORS.border }}>
          {DATE_OPTIONS.map((opt) => {
            const active = dateFilter === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setDateFilter(opt.value)}
                className="flex min-h-[44px] items-center justify-center px-3 py-2 text-xs font-bold transition-colors lg:min-h-0"
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

        {/* 필터 토글 */}
        <button
          type="button"
          onClick={onToggleFilterPanel}
          aria-expanded={filterPanelOpen}
          className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-[12px] border px-3 py-2 text-xs font-bold transition-colors lg:min-h-0"
          style={{
            background: filterPanelOpen
              ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`
              : LEGACY_COLORS.s2,
            borderColor: filterPanelOpen ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
            color: filterPanelOpen ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2,
          }}
        >
          <Filter className="h-3.5 w-3.5" />
          필터
          {activeFilterCount > 0 && (
            <span
              className="ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-black"
              style={{ background: LEGACY_COLORS.blue, color: LEGACY_COLORS.white }}
            >
              {activeFilterCount}
            </span>
          )}
          <ChevronDown
            className="h-3.5 w-3.5 transition-transform"
            style={{ transform: filterPanelOpen ? "rotate(180deg)" : undefined }}
          />
        </button>

        {/* 달력 토글 */}
        <button
          type="button"
          onClick={onToggleCalendar}
          aria-expanded={calendarOpen}
          className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-[12px] border px-3 py-2 text-xs font-bold transition-colors lg:min-h-0"
          style={{
            background: calendarOpen
              ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`
              : LEGACY_COLORS.s2,
            borderColor: calendarOpen ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
            color: calendarOpen ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2,
          }}
        >
          <CalendarDays className="h-3.5 w-3.5" />
          달력
          <ChevronDown
            className="h-3.5 w-3.5 transition-transform"
            style={{ transform: calendarOpen ? "rotate(180deg)" : undefined }}
          />
        </button>
      </div>
    </section>
  );
}
