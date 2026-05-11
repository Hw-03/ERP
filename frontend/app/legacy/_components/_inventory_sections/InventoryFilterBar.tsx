"use client";

import { ChevronDown, Filter, Layers, Search, Sparkles, TrendingUp } from "lucide-react";
import type { ProductModel } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { FilterChip } from "../common";

const DEPT_CHIPS = ["튜브", "고압", "진공", "튜닝", "조립", "출하"] as const;

const PROCESS_STEP_CHIPS: { value: "R" | "A" | "F"; label: string }[] = [
  { value: "R", label: "원자재" },
  { value: "A", label: "중간공정" },
  { value: "F", label: "공정완료" },
];

type FiltersProps = {
  open: boolean;
  selectedDepts: string[];
  selectedModels: string[];
  selectedProcessSteps: string[];
  productModels: ProductModel[];
  toggleDept: (v: string) => void;
  toggleModel: (v: string) => void;
  toggleProcessStep: (v: string) => void;
  onClearDepts: () => void;
  onClearModels: () => void;
  onClearProcessSteps: () => void;
};

export function InventoryFilters({
  open,
  selectedDepts,
  selectedModels,
  selectedProcessSteps,
  productModels,
  toggleDept,
  toggleModel,
  toggleProcessStep,
  onClearDepts,
  onClearModels,
  onClearProcessSteps,
}: FiltersProps) {
  if (!open) return null;
  return (
    <div className="mt-2.5 grid gap-2.5 xl:grid-cols-3">
      <div className="rounded-[16px] border p-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
        <div className="mb-2 flex items-center gap-2 text-sm font-bold">
          <Sparkles className="h-4 w-4" style={{ color: LEGACY_COLORS.green }} />
          부서 구분
        </div>
        <div className="grid grid-cols-3 gap-2">
          <FilterChip active={selectedDepts.length === 0} label="전체" onClick={onClearDepts} tone={LEGACY_COLORS.green} className="w-full" />
          <FilterChip
            active={selectedDepts.includes("창고")}
            label="창고"
            onClick={() => toggleDept("창고")}
            tone={LEGACY_COLORS.green}
            className="w-full"
          />
          {DEPT_CHIPS.map((name) => (
            <FilterChip
              key={name}
              active={selectedDepts.includes(name)}
              label={name}
              onClick={() => toggleDept(name)}
              tone={LEGACY_COLORS.green}
              className="w-full"
            />
          ))}
        </div>
      </div>
      <div className="rounded-[16px] border p-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
        <div className="mb-2 flex items-center gap-2 text-sm font-bold">
          <TrendingUp className="h-4 w-4" style={{ color: LEGACY_COLORS.cyan }} />
          모델 구분
        </div>
        <div className="grid grid-cols-3 gap-2 overflow-x-auto">
          <FilterChip active={selectedModels.length === 0} label="전체" onClick={onClearModels} tone={LEGACY_COLORS.cyan} className="w-full" />
          {productModels.map((m) => (
            <FilterChip
              key={m.model_name}
              active={selectedModels.includes(m.model_name ?? "")}
              label={m.model_name ?? ""}
              onClick={() => toggleModel(m.model_name ?? "")}
              tone={LEGACY_COLORS.cyan}
              className="w-full"
            />
          ))}
          <FilterChip
            active={selectedModels.includes("미분류")}
            label="미분류"
            onClick={() => toggleModel("미분류")}
            tone={LEGACY_COLORS.muted2}
            className="w-full"
          />
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
            className="w-full"
          />
          {PROCESS_STEP_CHIPS.map((step) => (
            <FilterChip
              key={step.value}
              active={selectedProcessSteps.includes(step.value)}
              label={step.label}
              onClick={() => toggleProcessStep(step.value)}
              tone={LEGACY_COLORS.yellow}
              className="w-full"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

type StickyHeaderProps = {
  searchValue: string;
  onSearchChange: (v: string) => void;
  count: number;
  activeFilterCount: number;
  filtersOpen: boolean;
  isFiltered: boolean;
  onToggleFilters: () => void;
};

export function InventoryTableStickyHeader({
  searchValue,
  onSearchChange,
  activeFilterCount,
  filtersOpen,
  isFiltered,
  onToggleFilters,
}: StickyHeaderProps) {
  return (
    <div
      className="sticky top-0 z-20 -mx-5 -mt-5 mb-4 rounded-t-[28px]"
      style={{
        background: LEGACY_COLORS.bg,
        backgroundImage: "linear-gradient(rgba(101, 169, 255, 0.08), rgba(101, 169, 255, 0.08))",
      }}
    >
      <div className="flex flex-wrap items-center gap-2.5 px-5 pb-3 pt-5">
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-base font-bold" style={{ color: LEGACY_COLORS.text }}>
            자재 목록
          </span>
          {isFiltered && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
              style={{
                background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`,
                color: LEGACY_COLORS.blue,
              }}
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: LEGACY_COLORS.blue }} />
              필터 적용 중
            </span>
          )}
        </div>
        <div
          className="flex min-w-[240px] flex-1 items-center gap-2 rounded-[14px] border px-3 py-2"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <Search className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
          <input
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="품명 · 품목 코드 · 위치 · 공급처 검색"
            className="flex-1 bg-transparent text-base outline-none"
            style={{ color: LEGACY_COLORS.text }}
          />
        </div>
        <button
          onClick={onToggleFilters}
          className="flex shrink-0 items-center gap-1.5 rounded-[14px] border px-3 py-2 text-sm font-semibold transition-colors hover:brightness-110"
          style={{
            background: filtersOpen
              ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`
              : LEGACY_COLORS.s2,
            borderColor: filtersOpen ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
            color: filtersOpen ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2,
          }}
          aria-expanded={filtersOpen}
        >
          <Filter className="h-3.5 w-3.5" />
          필터
          {activeFilterCount > 0 && (
            <span
              className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full text-[11px] font-bold leading-none"
              style={{ background: LEGACY_COLORS.blue, color: LEGACY_COLORS.white }}
            >
              {activeFilterCount}
            </span>
          )}
          <ChevronDown
            className="h-3.5 w-3.5 transition-transform"
            style={{ transform: filtersOpen ? "rotate(180deg)" : undefined }}
          />
        </button>
      </div>
    </div>
  );
}
