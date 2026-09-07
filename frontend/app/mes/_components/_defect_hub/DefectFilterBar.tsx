"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import { FilterChip } from "../common/FilterChip";
import { Search, X } from "lucide-react";

export type DefectScope = "my" | "production" | "all";
export type DefectActorScope = "all" | "mine";
export type DefectSort = "oldest" | "newest";

interface Props {
  scope: DefectScope;
  actorScope: DefectActorScope;
  sort: DefectSort;
  filterLocked: boolean;
  onScopeChange: (scope: DefectScope) => void;
  onActorScopeChange: (scope: DefectActorScope) => void;
  onSortChange: (sort: DefectSort) => void;
  onFilterLockedChange: (locked: boolean) => void;
  currentDept: string;
  search: string;
  setSearch: (value: string) => void;
}

export function DefectFilterBar({
  scope,
  actorScope,
  sort,
  filterLocked,
  onScopeChange,
  onActorScopeChange,
  onSortChange,
  onFilterLockedChange,
  currentDept,
  search,
  setSearch,
}: Props) {
  return (
    <div
      className="flex flex-wrap items-center gap-4 rounded-[14px] border px-4 py-3"
      style={{
        background: LEGACY_COLORS.s2,
        borderColor: LEGACY_COLORS.border,
      }}
    >
      {/* 부서 범위 칩 (단일선택 토글) */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-black uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>
          부서
        </span>
        <FilterChip
          label="내 부서"
          active={scope === "my"}
          onClick={() => onScopeChange("my")}
          size="sm"
        />
        <FilterChip
          label="전체"
          active={scope === "all"}
          onClick={() => onScopeChange("all")}
          size="sm"
        />
      </div>

      {/* 구분선 */}
      <div className="h-5 w-px" style={{ background: LEGACY_COLORS.border }} />

      {/* 격리 처리자 범위 칩 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-black uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>
          격리자
        </span>
        <FilterChip
          label="전체"
          active={actorScope === "all"}
          onClick={() => onActorScopeChange("all")}
          size="sm"
        />
        <FilterChip
          label="내가 격리"
          active={actorScope === "mine"}
          onClick={() => onActorScopeChange("mine")}
          size="sm"
        />
      </div>

      {/* 구분선 */}
      <div className="h-5 w-px" style={{ background: LEGACY_COLORS.border }} />

      {/* 정렬 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-black uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>
          정렬
        </span>
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as DefectSort)}
          className="rounded-[8px] border px-2 py-1 text-xs font-bold"
          style={{
            background: LEGACY_COLORS.s1,
            borderColor: LEGACY_COLORS.border,
            color: LEGACY_COLORS.text,
          }}
        >
          <option value="oldest">오래된 순</option>
          <option value="newest">최신 순</option>
        </select>
        <label
          className="-my-2 flex min-h-11 cursor-pointer select-none items-center gap-2 rounded-[8px] px-2 text-xs font-bold"
          style={{ color: LEGACY_COLORS.muted2 }}
        >
          <input
            type="checkbox"
            checked={filterLocked}
            onChange={(event) => onFilterLockedChange(event.target.checked)}
            className="h-4 w-4 cursor-pointer rounded border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-blue)] focus-visible:ring-offset-2"
            style={{ accentColor: LEGACY_COLORS.blue }}
          />
          <span>필터 고정</span>
        </label>
      </div>

      <div
        className="flex min-h-11 w-full min-w-[240px] flex-1 items-center gap-2 rounded-[10px] border px-3 lg:ml-auto lg:w-auto focus-within:ring-2 focus-within:ring-[var(--c-blue)] focus-within:ring-offset-2"
        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
      >
        <Search className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
        <input
          type="search"
          aria-label="불량 검색"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="품명 · 코드 · 부서 · 사유 · 처리자"
          className="min-h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"
          style={{ color: LEGACY_COLORS.text }}
        />
        {search && (
          <button
            type="button"
            aria-label="불량 검색 지우기"
            onClick={() => setSearch("")}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-[8px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-blue)]"
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
