"use client";

import { Layers, RotateCcw, Sparkles, TrendingUp } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { FilterChip } from "../common/FilterChip";
import { PROD_DEPTS } from "../_warehouse_steps/_constants";
import type { DefectProcessStep } from "./DefectFilterBar";

// 대시보드와 같은 창고 → 생산 부서 순서. 기타·과거 부서는 뒤에 유지한다.
const DEPARTMENT_ORDER: readonly string[] = ["창고", ...PROD_DEPTS];

const PROCESS_STEPS: ReadonlyArray<{ value: DefectProcessStep; label: string }> = [
  { value: "R", label: "원자재" },
  { value: "A", label: "중간공정" },
  { value: "F", label: "공정완료" },
  { value: "DISUSED", label: "불용" },
];

interface Props {
  departments: readonly string[];
  models: readonly string[];
  currentDept: string;
  showMyDepartment?: boolean;
  selectedDepartments: readonly string[];
  selectedModels: readonly string[];
  selectedProcessSteps: readonly DefectProcessStep[];
  onDepartmentsChange: (values: string[]) => void;
  onModelsChange: (values: string[]) => void;
  onProcessStepsChange: (values: DefectProcessStep[]) => void;
  onResetCategoryFilters: () => void;
}

function toggleValue<T>(selected: readonly T[], value: T): T[] {
  return selected.includes(value)
    ? selected.filter((entry) => entry !== value)
    : [...selected, value];
}

function FilterCard({ title, icon, children, columns = 3 }: { title: string; icon: React.ReactNode; children: React.ReactNode; columns?: 2 | 3 }) {
  return (
    <fieldset aria-label={title} className="min-w-0 rounded-[20px] border p-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
      <legend className="sr-only">{title}</legend>
      <div className="mb-2 flex items-center gap-2 text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>
        {icon}{title}
      </div>
      <div className={`grid grid-cols-2 gap-2 ${columns === 3 ? "sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3" : ""}`}>{children}</div>
    </fieldset>
  );
}

/** 목록과 통계가 공유하는 부서·모델·공정 3카드 필터. */
export function DefectCategoryFilters({
  departments,
  models,
  currentDept,
  showMyDepartment = true,
  selectedDepartments,
  selectedModels,
  selectedProcessSteps,
  onDepartmentsChange,
  onModelsChange,
  onProcessStepsChange,
  onResetCategoryFilters,
}: Props) {
  const orderedDepartments = [
    ...DEPARTMENT_ORDER.filter((department) => departments.includes(department)),
    ...departments.filter((department) => !DEPARTMENT_ORDER.includes(department)).sort(),
  ];

  return (
    <div className="grid min-w-0 gap-3 lg:grid-cols-3">
      <FilterCard title="부서 구분" icon={<Sparkles className="h-4 w-4" style={{ color: LEGACY_COLORS.green }} />}>
        <FilterChip active={selectedDepartments.length === 0} label="전체" onClick={() => onDepartmentsChange([])} tone={LEGACY_COLORS.green} className="min-h-11 w-full" />
        {orderedDepartments.map((department) => (
          <FilterChip key={department} active={selectedDepartments.includes(department)} label={department} onClick={() => onDepartmentsChange(toggleValue(selectedDepartments, department))} tone={LEGACY_COLORS.green} className="min-h-11 w-full" />
        ))}
        {showMyDepartment && <FilterChip active={selectedDepartments.length === 1 && selectedDepartments[0] === currentDept} label="내 부서" onClick={() => onDepartmentsChange(currentDept ? [currentDept] : [])} tone={LEGACY_COLORS.green} className="min-h-11 w-full" />}
      </FilterCard>

      <FilterCard title="모델 구분" icon={<TrendingUp className="h-4 w-4" style={{ color: LEGACY_COLORS.cyan }} />}>
        <FilterChip active={selectedModels.length === 0} label="전체" onClick={() => onModelsChange([])} tone={LEGACY_COLORS.cyan} className="min-h-11 w-full" />
        {models.map((model) => (
          <FilterChip key={model} active={selectedModels.includes(model)} label={model} onClick={() => onModelsChange(toggleValue(selectedModels, model))} tone={LEGACY_COLORS.cyan} className="min-h-11 w-full" />
        ))}
      </FilterCard>

      <FilterCard title="공정 구분" columns={2} icon={<Layers className="h-4 w-4" style={{ color: LEGACY_COLORS.yellow }} />}>
        <FilterChip active={selectedProcessSteps.length === 0} label="전체" onClick={() => onProcessStepsChange([])} tone={LEGACY_COLORS.yellow} className="min-h-11 w-full" />
        {PROCESS_STEPS.map((step) => (
          <FilterChip key={step.value} active={selectedProcessSteps.includes(step.value)} label={step.label} onClick={() => onProcessStepsChange(toggleValue(selectedProcessSteps, step.value))} tone={step.value === "DISUSED" ? LEGACY_COLORS.red : LEGACY_COLORS.yellow} className="min-h-11 w-full" />
        ))}
      </FilterCard>

      {(selectedDepartments.length > 0 || selectedModels.length > 0 || selectedProcessSteps.length > 0) && <button type="button" onClick={onResetCategoryFilters} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[16px] border px-4 text-sm font-bold transition-colors hover:brightness-110 lg:col-span-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.blue }}>
        <RotateCcw className="h-4 w-4" />
        전체 초기화
      </button>}
    </div>
  );
}
