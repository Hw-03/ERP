"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import { FilterChip } from "../common/FilterChip";

export type DefectScope = "my" | "production" | "all";
export type DefectSort = "oldest" | "newest";

const PRODUCTION_LINES = new Set(["튜브", "고압", "진공", "튜닝", "조립", "출하"]);

interface Props {
  scope: DefectScope;
  sort: DefectSort;
  onScopeChange: (scope: DefectScope) => void;
  onSortChange: (sort: DefectSort) => void;
  currentDept: string;
}

export function DefectFilterBar({
  scope,
  sort,
  onScopeChange,
  onSortChange,
  currentDept,
}: Props) {
  const isProductionLine = PRODUCTION_LINES.has(currentDept);

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
          onClick={() => isProductionLine && onScopeChange("my")}
          size="sm"
          className={isProductionLine ? "" : "cursor-not-allowed opacity-50"}
        />
        <FilterChip
          label="생산부 라인 전체"
          active={scope === "production"}
          onClick={() => onScopeChange("production")}
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

      {/* 정렬 */}
      <div className="flex items-center gap-2">
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
      </div>
    </div>
  );
}
