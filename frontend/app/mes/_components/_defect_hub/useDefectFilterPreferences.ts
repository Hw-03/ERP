"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DefectActorScope, DefectProcessStep, DefectScope, DefectSort } from "./DefectFilterBar";

const STORAGE_PREFIX = "dexcowin_mes_defect_filters:";
const STORAGE_VERSION = 2;
const PRODUCTION_DEPARTMENTS = ["튜브", "고압", "진공", "튜닝", "조립", "출하"] as const;
const VALID_SCOPES: DefectScope[] = ["my", "production", "all"];
const VALID_ACTOR_SCOPES: DefectActorScope[] = ["all", "mine"];
const VALID_SORTS: DefectSort[] = ["oldest", "newest"];
const VALID_PROCESS_STEPS: DefectProcessStep[] = ["R", "A", "F", "UNCLASSIFIED", "DISUSED"];

interface DefectFilterSnapshot {
  version: 2;
  scope: DefectScope;
  actorScope: DefectActorScope;
  sort: DefectSort;
  selectedDepartments: string[];
  selectedModels: string[];
  selectedProcessSteps: DefectProcessStep[];
}

interface DefectFilterSnapshotV1 {
  version: 1;
  scope: DefectScope;
  actorScope: DefectActorScope;
  sort: DefectSort;
}

type StoredFilterValues = Omit<DefectFilterSnapshot, "version">;

interface UseDefectFilterPreferencesOptions {
  employeeId: string;
  defaultScope: DefectScope;
  defaultSort: DefectSort;
  currentDept?: string;
  defectDeptFilter?: string | null;
}

function unique<T>(values: readonly T[]): T[] {
  return Array.from(new Set(values));
}

function isLegacyBaseSnapshot(
  value: unknown,
): value is Pick<DefectFilterSnapshotV1, "scope" | "actorScope" | "sort"> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as DefectFilterSnapshotV1;
  return VALID_SCOPES.includes(candidate.scope)
    && VALID_ACTOR_SCOPES.includes(candidate.actorScope)
    && VALID_SORTS.includes(candidate.sort);
}

function departmentsForScope(scope: DefectScope, currentDept?: string): string[] {
  if (scope === "my" && currentDept) return [currentDept];
  if (scope === "production") return [...PRODUCTION_DEPARTMENTS];
  return [];
}

/** v1의 부서 범위를 새 다중 선택 값으로 보존하면서 v2 저장 형식으로 승격한다. */
export function migrateDefectFilterSnapshot(
  value: unknown,
  currentDept?: string,
): DefectFilterSnapshot | null {
  if (!isLegacyBaseSnapshot(value)) return null;
  const candidate = value as DefectFilterSnapshotV1 | DefectFilterSnapshot;

  if (candidate.version === 1) {
    return {
      version: 2,
      scope: candidate.scope,
      actorScope: candidate.actorScope,
      sort: candidate.sort,
      selectedDepartments: departmentsForScope(candidate.scope, currentDept),
      selectedModels: [],
      selectedProcessSteps: [],
    };
  }

  if (
    candidate.version !== 2
    || !Array.isArray(candidate.selectedDepartments)
    || !candidate.selectedDepartments.every((entry) => typeof entry === "string")
    || !Array.isArray(candidate.selectedModels)
    || !candidate.selectedModels.every((entry) => typeof entry === "string")
    || !Array.isArray(candidate.selectedProcessSteps)
    || !candidate.selectedProcessSteps.every((entry) => VALID_PROCESS_STEPS.includes(entry))
  ) {
    return null;
  }

  return {
    version: 2,
    scope: candidate.scope,
    actorScope: candidate.actorScope,
    sort: candidate.sort,
    selectedDepartments: unique(candidate.selectedDepartments),
    selectedModels: unique(candidate.selectedModels.filter((model) => model !== "미분류")),
    selectedProcessSteps: unique(candidate.selectedProcessSteps.filter((step) => step !== "UNCLASSIFIED")),
  };
}

function storageKey(employeeId: string): string {
  return `${STORAGE_PREFIX}${employeeId}`;
}

function readSnapshot(employeeId: string, currentDept?: string): DefectFilterSnapshot | null {
  try {
    const raw = localStorage.getItem(storageKey(employeeId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    const snapshot = migrateDefectFilterSnapshot(parsed, currentDept);
    if (!snapshot) {
      localStorage.removeItem(storageKey(employeeId));
      return null;
    }
    if ((parsed as { version?: unknown }).version === 1) {
      localStorage.setItem(storageKey(employeeId), JSON.stringify(snapshot));
    }
    return snapshot;
  } catch {
    try {
      localStorage.removeItem(storageKey(employeeId));
    } catch {
      // localStorage가 차단된 환경에서는 화면 기본값으로 계속 동작한다.
    }
    return null;
  }
}

function writeSnapshot(employeeId: string, snapshot: DefectFilterSnapshot): boolean {
  try {
    localStorage.setItem(storageKey(employeeId), JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

export function useDefectFilterPreferences({
  employeeId,
  defaultScope,
  defaultSort,
  currentDept,
  defectDeptFilter,
}: UseDefectFilterPreferencesOptions) {
  const [scope, setScopeState] = useState<DefectScope>(defaultScope);
  const [actorScope, setActorScopeState] = useState<DefectActorScope>("all");
  const [sort, setSortState] = useState<DefectSort>(defaultSort);
  const [filterLocked, setFilterLockedState] = useState(false);
  const [selectedDepartments, setDepartmentState] = useState<string[]>(
    departmentsForScope(defaultScope, currentDept),
  );
  const [selectedModels, setModelState] = useState<string[]>([]);
  const [selectedProcessSteps, setProcessStepState] = useState<DefectProcessStep[]>([]);
  const valuesRef = useRef<StoredFilterValues>({
    scope: defaultScope,
    actorScope: "all",
    sort: defaultSort,
    selectedDepartments: departmentsForScope(defaultScope, currentDept),
    selectedModels: [],
    selectedProcessSteps: [],
  });
  const filterLockedRef = useRef(false);

  useEffect(() => {
    const saved = readSnapshot(employeeId, currentDept);
    const effectiveScope = defectDeptFilter ? "my" : saved?.scope ?? defaultScope;
    const restoredValues: StoredFilterValues = {
      scope: effectiveScope,
      actorScope: saved?.actorScope ?? "all",
      sort: saved?.sort ?? defaultSort,
      selectedDepartments: defectDeptFilter
        ? [defectDeptFilter]
        : saved?.selectedDepartments ?? departmentsForScope(defaultScope, currentDept),
      selectedModels: saved?.selectedModels ?? [],
      selectedProcessSteps: saved?.selectedProcessSteps ?? [],
    };
    valuesRef.current = restoredValues;
    filterLockedRef.current = saved !== null;
    setScopeState(effectiveScope);
    setActorScopeState(restoredValues.actorScope);
    setSortState(restoredValues.sort);
    setDepartmentState(restoredValues.selectedDepartments);
    setModelState(restoredValues.selectedModels);
    setProcessStepState(restoredValues.selectedProcessSteps);
    setFilterLockedState(filterLockedRef.current);
  }, [employeeId, defaultScope, defaultSort, currentDept, defectDeptFilter]);

  const persist = useCallback((next: StoredFilterValues): void => {
    if (!writeSnapshot(employeeId, { version: STORAGE_VERSION, ...next })) {
      filterLockedRef.current = false;
      setFilterLockedState(false);
    }
  }, [employeeId]);

  const updateValues = useCallback((next: Partial<StoredFilterValues>): StoredFilterValues => {
    const updated = { ...valuesRef.current, ...next };
    valuesRef.current = updated;
    return updated;
  }, []);

  const setScope = useCallback((next: DefectScope): void => {
    const updated = updateValues({ scope: next });
    setScopeState(next);
    if (filterLockedRef.current) persist(updated);
  }, [persist, updateValues]);

  const setActorScope = useCallback((next: DefectActorScope): void => {
    const updated = updateValues({ actorScope: next });
    setActorScopeState(next);
    if (filterLockedRef.current) persist(updated);
  }, [persist, updateValues]);

  const setSort = useCallback((next: DefectSort): void => {
    const updated = updateValues({ sort: next });
    setSortState(next);
    if (filterLockedRef.current) persist(updated);
  }, [persist, updateValues]);

  const setSelectedDepartments = useCallback((values: string[]): void => {
    const next = unique(values);
    const updated = updateValues({ selectedDepartments: next });
    setDepartmentState(next);
    if (filterLockedRef.current) persist(updated);
  }, [persist, updateValues]);

  const setSelectedModels = useCallback((values: string[]): void => {
    const next = unique(values);
    const updated = updateValues({ selectedModels: next });
    setModelState(next);
    if (filterLockedRef.current) persist(updated);
  }, [persist, updateValues]);

  const setSelectedProcessSteps = useCallback((values: DefectProcessStep[]): void => {
    const next = unique(values);
    const updated = updateValues({ selectedProcessSteps: next });
    setProcessStepState(next);
    if (filterLockedRef.current) persist(updated);
  }, [persist, updateValues]);

  const resetCategoryFilters = useCallback((): void => {
    const updated = updateValues({
      selectedDepartments: [],
      selectedModels: [],
      selectedProcessSteps: [],
    });
    setDepartmentState([]);
    setModelState([]);
    setProcessStepState([]);
    if (filterLockedRef.current) persist(updated);
  }, [persist, updateValues]);

  const setFilterLocked = useCallback((locked: boolean): void => {
    if (!locked) {
      try {
        localStorage.removeItem(storageKey(employeeId));
      } catch {
        // localStorage가 차단된 환경에서도 현재 화면 필터는 유지한다.
      }
      filterLockedRef.current = false;
      setFilterLockedState(false);
      return;
    }
    if (writeSnapshot(employeeId, { version: STORAGE_VERSION, ...valuesRef.current })) {
      filterLockedRef.current = true;
      setFilterLockedState(true);
    }
  }, [employeeId]);

  return {
    scope,
    actorScope,
    sort,
    filterLocked,
    selectedDepartments,
    selectedModels,
    selectedProcessSteps,
    setScope,
    setActorScope,
    setSort,
    setFilterLocked,
    setSelectedDepartments,
    setSelectedModels,
    setSelectedProcessSteps,
    resetCategoryFilters,
  };
}
