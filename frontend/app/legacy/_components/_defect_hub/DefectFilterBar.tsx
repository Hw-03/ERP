"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";

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
      {/* 부서 범위 라디오 */}
      <div className="flex items-center gap-1">
        <span className="mr-2 text-xs font-black uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>
          부서
        </span>
        <RadioOption
          id="scope-my"
          label="내 부서"
          checked={scope === "my"}
          disabled={!isProductionLine}
          onChange={() => onScopeChange("my")}
        />
        <RadioOption
          id="scope-production"
          label="생산부 라인 전체"
          checked={scope === "production"}
          onChange={() => onScopeChange("production")}
        />
        <RadioOption
          id="scope-all"
          label="전체"
          checked={scope === "all"}
          onChange={() => onScopeChange("all")}
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

function RadioOption({
  id,
  label,
  checked,
  disabled = false,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-1.5 rounded-[8px] px-2 py-1 text-xs font-bold transition-colors hover:brightness-95"
      style={{
        color: disabled ? LEGACY_COLORS.muted2 : checked ? LEGACY_COLORS.red : LEGACY_COLORS.text,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <input
        type="radio"
        id={id}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="accent-red-600"
      />
      {label}
    </label>
  );
}
