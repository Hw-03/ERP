"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import { FilterChip } from "../common/FilterChip";
import { DefectCategoryFilters } from "./DefectCategoryFilters";

export type DefectScope = "my" | "production" | "all";
export type DefectActorScope = "all" | "mine";
export type DefectSort = "oldest" | "newest";
export type DefectProcessStep = "R" | "A" | "F" | "UNCLASSIFIED" | "DISUSED";

interface Props {
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

/**
 * 불량 목록의 분류 필터 UI. 그룹 안 선택은 OR이며, 부서·모델·공정 그룹 간 AND 조합은 부모가 적용한다.
 */
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
  const readableBlue = `color-mix(in srgb, ${LEGACY_COLORS.blue} 30%, ${LEGACY_COLORS.text})`;
  const readableMuted = `color-mix(in srgb, ${LEGACY_COLORS.muted2} 30%, ${LEGACY_COLORS.text})`;
  const activeDepartments = [...(selectedDepartments ?? legacyDepartments(scope, currentDept))];

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
        <span className="mr-1 text-xs font-black uppercase tracking-[1.5px]" style={{ color: readableMuted }}>격리자</span>
        <FilterChip label="전체" active={actorScope === "all"} onClick={() => onActorScopeChange("all")} size="sm" className="min-h-11" textTone={readableBlue} />
        <FilterChip label="내가 격리" active={actorScope === "mine"} onClick={() => onActorScopeChange("mine")} size="sm" className="min-h-11" textTone={readableBlue} />
        <span className="ml-1 text-xs font-black uppercase tracking-[1.5px]" style={{ color: readableMuted }}>정렬</span>
        <select aria-label="정렬" value={sort} onChange={(event) => onSortChange(event.target.value as DefectSort)} className="min-h-11 rounded-[12px] border px-3 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-blue)] focus-visible:ring-offset-2" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>
          <option value="oldest">오래된 순</option>
          <option value="newest">최신 순</option>
        </select>
        <label className="flex min-h-11 cursor-pointer select-none items-center gap-2 rounded-[12px] px-2 text-sm font-bold" style={{ color: readableMuted }}>
          <input type="checkbox" checked={filterLocked} onChange={(event) => onFilterLockedChange(event.target.checked)} className="h-4 w-4 cursor-pointer rounded border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-blue)] focus-visible:ring-offset-2" style={{ accentColor: LEGACY_COLORS.blue }} />
          <span>필터 고정</span>
        </label>
      </div>
    </section>
  );
}
