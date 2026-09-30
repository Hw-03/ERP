"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { FilterChip } from "../common/FilterChip";
import { DefectCategoryFilters } from "./DefectCategoryFilters";

export type DefectScope = "my" | "production" | "all";
export type DefectActorScope = "all" | "mine";
export type DefectSort = "oldest" | "newest";
export type DefectProcessStep = "R" | "A" | "F" | "UNCLASSIFIED" | "DISUSED";

interface Props {
  mobilePresentation?: boolean;
  /** @deprecated 기존 호출부 호환용. 새 목록 필터는 selectedDepartments를 사용한다. */
  scope: DefectScope;
  actorScope: DefectActorScope;
  sort: DefectSort;
  filterLocked: boolean;
  /** @deprecated 기존 호출부 호환용. 새 목록 필터는 onDepartmentsChange를 사용한다. */
  onScopeChange: (scope: DefectScope) => void;
  onActorScopeChange: (scope: DefectActorScope) => void;
  onSortChange: (sort: DefectSort) => void;
  onFilterLockedChange: (locked: boolean) => void;
  currentDept: string;
  /** @deprecated 검색은 DefectSearchInput으로 분리됐다. 기존 호출부 호환용으로만 받는다. */
  search?: string;
  /** @deprecated 검색은 DefectSearchInput으로 분리됐다. 기존 호출부 호환용으로만 받는다. */
  setSearch?: (value: string) => void;
  /** 실제 목록에서 추린 부서명. 같은 그룹은 다중 선택(OR)이다. */
  departments?: readonly string[];
  selectedDepartments?: readonly string[];
  onDepartmentsChange?: (departments: string[]) => void;
  /** 실제 목록/모델 마스터에서 추린 모델명. */
  models?: readonly string[];
  selectedModels?: readonly string[];
  onModelsChange?: (models: string[]) => void;
  selectedProcessSteps?: readonly DefectProcessStep[];
  onProcessStepsChange?: (steps: DefectProcessStep[]) => void;
  /** 세 그룹만 비우는 부모 단일 콜백. 검색·격리자·정렬에는 관여하지 않는다. */
  onResetCategoryFilters?: () => void;
}

function legacyDepartments(scope: DefectScope, currentDept: string): string[] {
  return scope === "my" && currentDept ? [currentDept] : [];
}

const PROCESS_LABELS: Record<DefectProcessStep, string> = {
  R: "원자재", A: "중간공정", F: "공정완료", UNCLASSIFIED: "미분류", DISUSED: "불용",
};

function shortSelection(values: readonly string[]): string {
  return values.length > 1 ? `${values[0]} 외 ${values.length - 1}` : values[0];
}

/**
 * 불량 목록의 분류 필터 UI. 그룹 안 선택은 OR이며, 부서·모델·공정 그룹 간 AND 조합은 부모가 적용한다.
 */
export function DefectFilterBar({
  mobilePresentation = false,
  scope,
  actorScope,
  sort,
  filterLocked,
  onScopeChange,
  onActorScopeChange,
  onSortChange,
  onFilterLockedChange,
  currentDept,
  departments = [],
  selectedDepartments,
  onDepartmentsChange,
  models = [],
  selectedModels = [],
  onModelsChange,
  selectedProcessSteps = [],
  onProcessStepsChange,
  onResetCategoryFilters,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const activeDepartments = [...(selectedDepartments ?? legacyDepartments(scope, currentDept))];
  const activeConditions = [
    activeDepartments.length ? `부서 ${shortSelection(activeDepartments)}` : null,
    selectedModels?.length ? `모델 ${shortSelection(selectedModels)}` : null,
    selectedProcessSteps.length ? `공정 ${shortSelection(selectedProcessSteps.map((step) => PROCESS_LABELS[step]))}` : null,
    actorScope === "mine" ? "내가 격리" : null,
  ].filter(Boolean);
  const summary = [
    ...(activeConditions.length ? activeConditions : ["전체"]),
    sort === "oldest" ? "오래된 순" : "최신 순",
    ...(filterLocked ? ["필터 고정"] : []),
  ].join(" · ");

  function setDepartments(next: string[]): void {
    if (onDepartmentsChange) {
      onDepartmentsChange(next);
      return;
    }
    // 이전 호출부는 부서 하나만 표현할 수 있다. 다중 선택은 상위 화면 통합 뒤에 사용한다.
    onScopeChange(next.length === 1 && next[0] === currentDept ? "my" : "all");
  }

  function resetCategories(): void {
    if (onResetCategoryFilters) {
      onResetCategoryFilters();
      return;
    }
    setDepartments([]);
    onModelsChange?.([]);
    onProcessStepsChange?.([]);
  }

  return (
    <section aria-label="불량 목록 필터" className="flex flex-col gap-3">
      {mobilePresentation && (
        <button
          type="button"
          aria-label={expanded ? "필터 접기" : "필터 펼치기"}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="flex min-h-11 w-full items-center gap-3 rounded-[16px] border px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-blue)]"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
        >
          <span className="shrink-0 text-sm font-black">필터</span>
          <span className="min-w-0 flex-1 text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{summary}</span>
          {expanded ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
        </button>
      )}
      {(!mobilePresentation || expanded) && <>
      <DefectCategoryFilters
        departments={departments}
        models={models}
        currentDept={currentDept}
        selectedDepartments={activeDepartments}
        selectedModels={selectedModels}
        selectedProcessSteps={selectedProcessSteps}
        onDepartmentsChange={setDepartments}
        onModelsChange={(values) => onModelsChange?.(values)}
        onProcessStepsChange={(values) => onProcessStepsChange?.(values)}
        onResetCategoryFilters={resetCategories}
      />

      <div className="flex flex-wrap items-center gap-2 rounded-[16px] border px-3 py-2" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
        <span className="mr-1 text-xs font-black uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>격리자</span>
        <FilterChip label="전체" active={actorScope === "all"} onClick={() => onActorScopeChange("all")} size="sm" className="min-h-11" />
        <FilterChip label="내가 격리" active={actorScope === "mine"} onClick={() => onActorScopeChange("mine")} size="sm" className="min-h-11" />
        <span className="ml-1 text-xs font-black uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>정렬</span>
        <select aria-label="정렬" value={sort} onChange={(event) => onSortChange(event.target.value as DefectSort)} className="min-h-11 rounded-[12px] border px-3 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-blue)] focus-visible:ring-offset-2" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>
          <option value="oldest">오래된 순</option>
          <option value="newest">최신 순</option>
        </select>
        <label className="flex min-h-11 cursor-pointer select-none items-center gap-2 rounded-[12px] px-2 text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
          <input type="checkbox" checked={filterLocked} onChange={(event) => onFilterLockedChange(event.target.checked)} className="h-4 w-4 cursor-pointer rounded border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-blue)] focus-visible:ring-offset-2" style={{ accentColor: LEGACY_COLORS.blue }} />
          <span>필터 고정</span>
        </label>
      </div>
      </>}
    </section>
  );
}
