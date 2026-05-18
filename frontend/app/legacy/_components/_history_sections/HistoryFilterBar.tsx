"use client";

import { HelpCircle, Search, X } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { FilterChip } from "../common";
import {
  DATE_OPTIONS,
  DEPT_INTERNAL_TYPES,
  SCOPE_LABELS,
  TYPE_OPTIONS,
  WAREHOUSE_INVOLVED_TYPES,
  type HistoryScope,
  type TypeOption,
} from "./historyShared";

const _wh = new Set<string>(WAREHOUSE_INVOLVED_TYPES);
const _dept = new Set<string>(DEPT_INTERNAL_TYPES);

/**
 * scope 안에서 노출할 칩 옵션.
 * - ALL → 전체 옵션
 * - WAREHOUSE_INVOLVED → transactionTypes 가 모두 WAREHOUSE_INVOLVED_TYPES 부분집합인 옵션 + "전체"
 * - DEPT_INTERNAL → 동일 (DEPT_INTERNAL_TYPES 부분집합) + "전체"
 * 수량 조정/불량 처리/공급사 반품(ambiguous)은 ALL scope 에서만 노출.
 */
function getTypeOptionsForScope(scope: HistoryScope): TypeOption[] {
  if (scope === "ALL") return TYPE_OPTIONS;
  const base = scope === "WAREHOUSE_INVOLVED" ? _wh : _dept;
  return TYPE_OPTIONS.filter((o) => {
    if (o.value === "ALL") return true;
    if (o.transactionTypes.length === 0) return true;
    return o.transactionTypes.every((t) => base.has(t));
  });
}

const SCOPE_ORDER: HistoryScope[] = ["ALL", "WAREHOUSE_INVOLVED", "DEPT_INTERNAL"];

type Props = {
  search: string;
  setSearch: (v: string) => void;
  dateFilter: string;
  setDateFilter: (v: string) => void;
  typeFilter: string;
  setTypeFilter: (v: string) => void;
  scope: HistoryScope;
  setScope: (s: HistoryScope) => void;
  totalCount: number;
};

export function HistoryFilterBar({
  search,
  setSearch,
  dateFilter,
  setDateFilter,
  typeFilter,
  setTypeFilter,
  scope,
  setScope,
  totalCount,
}: Props) {
  const typeOptions = getTypeOptionsForScope(scope);

  function handleScopeChange(next: HistoryScope) {
    setScope(next);
    // 새 scope 에서 노출 안 되는 옵션이면 ALL 로 리셋.
    const next_chips = getTypeOptionsForScope(next);
    if (!next_chips.some((o) => o.value === typeFilter)) setTypeFilter("ALL");
  }

  return (
    <section className="card" style={{ paddingTop: 14, paddingBottom: 14 }}>
      <div className="flex flex-col gap-2.5">
        {/* 0줄: scope 탭 (전체 / 창고 포함 / 부서 내부) */}
        <div className="flex items-center gap-2 self-start">
          <div className="flex overflow-hidden rounded-[12px] border" style={{ borderColor: LEGACY_COLORS.border }}>
            {SCOPE_ORDER.map((s) => {
              const active = scope === s;
              return (
                <button
                  key={s}
                  onClick={() => handleScopeChange(s)}
                  className="px-4 py-2 text-xs font-bold transition-colors"
                  style={{
                    background: active ? LEGACY_COLORS.blue : "transparent",
                    color: active ? LEGACY_COLORS.white : LEGACY_COLORS.muted2,
                  }}
                >
                  {SCOPE_LABELS[s]}
                </button>
              );
            })}
          </div>
          <span
            className="inline-flex items-center gap-1 text-[11px]"
            style={{ color: LEGACY_COLORS.muted2 }}
            title="수량 조정/불량 처리/공급사 반품은 거래 타입만으로 창고/부서를 단정할 수 없어 '전체' scope에서만 별도 칩으로 노출됩니다."
          >
            <HelpCircle className="h-3 w-3" />
            수량 조정/불량 처리/공급사 반품은 &apos;전체&apos;에서 확인
          </span>
        </div>

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

        {/* 2줄: 거래 유형 칩 (scope 기준 필터링) */}
        <div className="flex flex-wrap items-center gap-1.5">
          {typeOptions.map((opt) => (
            <FilterChip
              key={opt.value}
              active={typeFilter === opt.value}
              label={opt.label}
              onClick={() => setTypeFilter(opt.value)}
              size="sm"
            />
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
                유형: {TYPE_OPTIONS.find((opt) => opt.value === typeFilter)?.label ?? typeFilter}
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
