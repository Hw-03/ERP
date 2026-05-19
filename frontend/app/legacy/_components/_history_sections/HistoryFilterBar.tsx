"use client";

import { Search } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { DATE_OPTIONS } from "./historyQuery";

// 3차: 거래 유형 칩 줄·"적용됨" 요약 줄 폐기 — 거래 종류는 "필터" 패널 카드로 단일화.
// 검색 + 기간 세그먼트만 담당.
type Props = {
  search: string;
  setSearch: (v: string) => void;
  dateFilter: string;
  setDateFilter: (v: string) => void;
};

export function HistoryFilterBar({ search, setSearch, dateFilter, setDateFilter }: Props) {
  return (
    <section className="card" style={{ paddingTop: 14, paddingBottom: 14 }}>
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
    </section>
  );
}
