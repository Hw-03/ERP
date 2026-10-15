"use client";

import { Layers, RotateCcw, Sparkles, TrendingUp } from "lucide-react";
import type { ProductModel } from "@/lib/api";
import type { ReactNode, Ref } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { FilterChip } from "../common";
import { SearchInput } from "../common/SearchInput";
import type { DepartmentFilterBasis } from "./inventoryFilter";

const DEPT_CHIPS = ["튜브", "고압", "진공", "튜닝", "조립", "출하"] as const;

const PROCESS_STEP_CHIPS: { value: "R" | "A" | "F" | "DEFECT"; label: string }[] = [
  { value: "R", label: "원자재" },
  { value: "A", label: "중간공정" },
  { value: "F", label: "공정완료" },
  { value: "DEFECT", label: "불량" },
];

type FiltersProps = {
  open: boolean;
  selectedDepts: string[];
  departmentFilterBasis: DepartmentFilterBasis;
  selectedModels: string[];
  selectedProcessSteps: string[];
  showDisused: boolean;
  productModels: ProductModel[];
  toggleDept: (v: string) => void;
  onDepartmentFilterBasisChange: (basis: DepartmentFilterBasis) => void;
  toggleModel: (v: string) => void;
  toggleProcessStep: (v: string) => void;
  toggleDisused: () => void;
  onClearDepts: () => void;
  onClearModels: () => void;
  onClearProcessSteps: () => void;
  onResetAll: () => void;
  isAnyFilterActive: boolean;
  showResetAll?: boolean;
  locationFilter?: ReactNode;
  departmentOptions?: readonly string[];
  showDepartmentFilterBasis?: boolean;
  panelId?: string;
  chipClassName?: string;
  className?: string;
};

export function InventoryFilters({
  open,
  selectedDepts,
  departmentFilterBasis,
  selectedModels,
  selectedProcessSteps,
  showDisused,
  productModels,
  toggleDept,
  onDepartmentFilterBasisChange,
  toggleModel,
  toggleProcessStep,
  toggleDisused,
  onClearDepts,
  onClearModels,
  onClearProcessSteps,
  onResetAll,
  isAnyFilterActive,
  showResetAll = true,
  locationFilter,
  departmentOptions = ["창고", ...DEPT_CHIPS],
  showDepartmentFilterBasis = true,
  panelId = "inventory-filter-panel",
  chipClassName = "w-full",
  className = "",
}: FiltersProps) {
  if (!open) return null;
  return (
    <div id={panelId} className={`mt-3 grid gap-3 xl:grid-cols-3 ${className}`}>
      <div className="rounded-[16px] border p-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
        {locationFilter ?? <>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Sparkles className="h-4 w-4" style={{ color: LEGACY_COLORS.green }} />
            부서 구분
          </div>
          {showDepartmentFilterBasis && <div className="inline-flex shrink-0 items-stretch rounded-[12px] border p-1" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
            {([
              ["code", "품목 코드 기준"],
              ["location", "재고 위치 기준"],
            ] as const).map(([basis, label]) => {
              const active = departmentFilterBasis === basis;
              return (
                <button
                  key={basis}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onDepartmentFilterBasisChange(basis)}
                  className="rounded-[8px] px-2 py-1 text-xs font-bold transition-colors"
                  style={{
                    background: active ? `color-mix(in srgb, ${LEGACY_COLORS.green} 20%, transparent)` : "transparent",
                    color: active ? LEGACY_COLORS.green : LEGACY_COLORS.muted2,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <FilterChip active={selectedDepts.length === 0} label="전체" onClick={onClearDepts} tone={LEGACY_COLORS.green} className={chipClassName} />
          {departmentOptions.map((name) => (
            <FilterChip
              key={name}
              active={selectedDepts.includes(name)}
              label={name}
              onClick={() => toggleDept(name)}
              tone={LEGACY_COLORS.green}
              className={chipClassName}
            />
          ))}
        </div>
        </>}
      </div>
      <div className="rounded-[16px] border p-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
        <div className="mb-2 flex items-center gap-2 text-sm font-bold">
          <TrendingUp className="h-4 w-4" style={{ color: LEGACY_COLORS.cyan }} />
          모델 구분
        </div>
        <div className="grid grid-cols-3 gap-2 overflow-x-auto">
          <FilterChip active={selectedModels.length === 0} label="전체" onClick={onClearModels} tone={LEGACY_COLORS.cyan} className={chipClassName} />
          {productModels.map((m) => (
            <FilterChip
              key={m.model_name}
              active={selectedModels.includes(m.model_name ?? "")}
              label={m.model_name ?? ""}
              onClick={() => toggleModel(m.model_name ?? "")}
              tone={LEGACY_COLORS.cyan}
              className={chipClassName}
            />
          ))}
        </div>
      </div>
      <div className="rounded-[16px] border p-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
        <div className="mb-2 flex items-center gap-2 text-sm font-bold">
          <Layers className="h-4 w-4" style={{ color: LEGACY_COLORS.yellow }} />
          공정 구분
        </div>
        <div className="grid grid-cols-2 gap-2">
          <FilterChip
            active={selectedProcessSteps.length === 0}
            label="전체"
            onClick={onClearProcessSteps}
            tone={LEGACY_COLORS.yellow}
            className={chipClassName}
          />
          {PROCESS_STEP_CHIPS.map((step) => (
            <FilterChip
              key={step.value}
              active={selectedProcessSteps.includes(step.value)}
              label={step.label}
              onClick={() => toggleProcessStep(step.value)}
              tone={LEGACY_COLORS.yellow}
              className={chipClassName}
            />
          ))}
          <FilterChip
            active={showDisused}
            label="불용"
            onClick={toggleDisused}
            tone={LEGACY_COLORS.red}
            className={chipClassName}
          />
        </div>
      </div>
      {showResetAll && <button
        type="button"
        onClick={onResetAll}
        disabled={!isAnyFilterActive}
        className="xl:col-span-3 flex w-full items-center justify-center gap-2 rounded-[16px] border px-4 py-2.5 text-sm font-bold transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          background: LEGACY_COLORS.s2,
          borderColor: LEGACY_COLORS.border,
          color: isAnyFilterActive ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2,
        }}
      >
        <RotateCcw className="h-4 w-4" />
        전체 초기화
      </button>}
    </div>
  );
}

type StickyHeaderProps = {
  onManageSearch?: () => void;
  searchValue: string;
  onSearchChange: (v: string) => void;
  count: number;
  isFiltered: boolean;
  onResetAllFilters?: () => void;
  disabled?: boolean;
  compact?: boolean;
  searchLabel?: string;
  searchPlaceholder?: string;
  headerRef?: Ref<HTMLDivElement>;
};

export function InventoryTableStickyHeader({
  searchValue,
  onSearchChange,
  isFiltered,
  onResetAllFilters,
  disabled = false,
  compact = false,
  searchLabel = "자재 검색",
  searchPlaceholder = "품명 · 품목 코드 · 위치 · 공급처 검색",
  headerRef,
  onManageSearch,
}: StickyHeaderProps) {
  return (
    <div
      ref={headerRef}
      className={compact ? "sticky top-0 z-20 mb-0 rounded-t-[20px]" : "sticky top-0 z-20 -mx-5 -mt-5 mb-0 rounded-t-[24px]"}
      style={{
        background: "var(--c-popup-bg)",
      }}
    >
      <div className={compact ? "flex items-center px-3 pb-3 pt-3" : "flex flex-wrap items-center gap-2.5 px-5 pb-[15px] pt-[14px]"}>
        <SearchInput value={searchValue} onChange={onSearchChange} placeholder={searchPlaceholder} disabled={disabled} ariaLabel={searchLabel} className="min-w-0 flex-1" />
        {onManageSearch && <button type="button" onClick={onManageSearch} disabled={disabled} className="min-h-11 shrink-0 rounded-[14px] border px-3 text-sm font-semibold active:scale-95 disabled:opacity-50"
          style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.blue, borderColor: LEGACY_COLORS.border }}>검색어 연결</button>}
      </div>
      <div
        aria-hidden
        data-testid="inventory-sticky-header-corner-mask"
        className="pointer-events-none absolute -right-px left-0 top-0 z-30 flex h-6 justify-between"
      >
        <span
          className="h-6 w-6"
          style={{ background: "radial-gradient(circle at 100% 100%, transparent 0 23px, var(--c-bg) 24px)" }}
        />
        <span
          className="h-6 w-6"
          style={{ background: "radial-gradient(circle at 0 100%, transparent 0 23px, var(--c-bg) 24px)" }}
        />
      </div>
    </div>
  );
}
