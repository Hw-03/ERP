"use client";

import { useCallback, useEffect, useState } from "react";
import type { DefectActorScope, DefectScope, DefectSort } from "./DefectFilterBar";

const STORAGE_PREFIX = "dexcowin_mes_defect_filters:";
const STORAGE_VERSION = 1;

interface DefectFilterSnapshot {
  version: typeof STORAGE_VERSION;
  scope: DefectScope;
  actorScope: DefectActorScope;
  sort: DefectSort;
}

interface UseDefectFilterPreferencesOptions {
  employeeId: string;
  defaultScope: DefectScope;
  defaultSort: DefectSort;
  defectDeptFilter?: string | null;
}

interface DefectFilterPreferences {
  scope: DefectScope;
  actorScope: DefectActorScope;
  sort: DefectSort;
  filterLocked: boolean;
  setScope: (scope: DefectScope) => void;
  setActorScope: (scope: DefectActorScope) => void;
  setSort: (sort: DefectSort) => void;
  setFilterLocked: (locked: boolean) => void;
}

function storageKey(employeeId: string): string {
  return `${STORAGE_PREFIX}${employeeId}`;
}

function isDefectFilterSnapshot(value: unknown): value is DefectFilterSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DefectFilterSnapshot>;
  return (
    candidate.version === STORAGE_VERSION &&
    (candidate.scope === "my" || candidate.scope === "production" || candidate.scope === "all") &&
    (candidate.actorScope === "all" || candidate.actorScope === "mine") &&
    (candidate.sort === "oldest" || candidate.sort === "newest")
  );
}

function removeSnapshot(employeeId: string): void {
  try {
    window.localStorage.removeItem(storageKey(employeeId));
  } catch {
    // Storage can be unavailable in restricted browser contexts; filters remain usable in memory.
  }
}

function readSnapshot(employeeId: string): DefectFilterSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(employeeId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (isDefectFilterSnapshot(parsed)) return parsed;
  } catch {
    // Invalid or unavailable storage falls back to the screen defaults below.
  }
  removeSnapshot(employeeId);
  return null;
}

function writeSnapshot(employeeId: string, snapshot: DefectFilterSnapshot): boolean {
  try {
    window.localStorage.setItem(storageKey(employeeId), JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

/** Keeps defect list filters in memory and optionally persists them for one employee/browser. */
export function useDefectFilterPreferences({
  employeeId,
  defaultScope,
  defaultSort,
  defectDeptFilter,
}: UseDefectFilterPreferencesOptions): DefectFilterPreferences {
  const [scope, setScopeState] = useState<DefectScope>(defaultScope);
  const [actorScope, setActorScopeState] = useState<DefectActorScope>("all");
  const [sort, setSortState] = useState<DefectSort>(defaultSort);
  const [filterLocked, setFilterLockedState] = useState(false);

  useEffect(() => {
    const saved = readSnapshot(employeeId);
    setScopeState(defectDeptFilter ? "my" : saved?.scope ?? defaultScope);
    setActorScopeState(saved?.actorScope ?? "all");
    setSortState(saved?.sort ?? defaultSort);
    setFilterLockedState(saved !== null);
  }, [employeeId, defaultScope, defaultSort, defectDeptFilter]);

  const persist = useCallback((next: Omit<DefectFilterSnapshot, "version">): void => {
    if (writeSnapshot(employeeId, { version: STORAGE_VERSION, ...next })) return;
    setFilterLockedState(false);
  }, [employeeId]);

  const setScope = useCallback((nextScope: DefectScope): void => {
    setScopeState(nextScope);
    if (filterLocked) persist({ scope: nextScope, actorScope, sort });
  }, [actorScope, filterLocked, persist, sort]);

  const setActorScope = useCallback((nextActorScope: DefectActorScope): void => {
    setActorScopeState(nextActorScope);
    if (filterLocked) persist({ scope, actorScope: nextActorScope, sort });
  }, [filterLocked, persist, scope, sort]);

  const setSort = useCallback((nextSort: DefectSort): void => {
    setSortState(nextSort);
    if (filterLocked) persist({ scope, actorScope, sort: nextSort });
  }, [actorScope, filterLocked, persist, scope]);

  const setFilterLocked = useCallback((locked: boolean): void => {
    if (!locked) {
      removeSnapshot(employeeId);
      setFilterLockedState(false);
      return;
    }
    if (writeSnapshot(employeeId, { version: STORAGE_VERSION, scope, actorScope, sort })) {
      setFilterLockedState(true);
    }
  }, [actorScope, employeeId, scope, sort]);

  return {
    scope,
    actorScope,
    sort,
    filterLocked,
    setScope,
    setActorScope,
    setSort,
    setFilterLocked,
  };
}
