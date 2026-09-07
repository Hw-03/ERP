"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { DepartmentMaster } from "@/lib/api";
import { departmentDisplayColor, employeeColor } from "@/lib/mes/color";
import { normalizeDepartment } from "@/lib/mes/department";
import { queryKeys } from "@/lib/queries/keys";
import { useDepartmentsQuery } from "@/lib/queries/useDepartmentsQuery";

type Ctx = {
  departments: DepartmentMaster[];
  refresh: () => Promise<void>;
  getColor: (name?: string | null) => string;
};

const DepartmentsCtx = createContext<Ctx | null>(null);

export function DepartmentsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data: departments = [] } = useDepartmentsQuery({ isActive: true });

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.departments.all }),
    [queryClient],
  );

  // departments 가 바뀔 때만 lookup 함수가 새로 만들어지도록.
  const getColor = useMemo(() => {
    const byName = new Map<string, string>();
    for (const d of departments) {
      if (d.color_hex) byName.set(d.name, d.color_hex);
    }
    return (name?: string | null) => {
      if (!name) return departmentDisplayColor(employeeColor(name));
      const normalized = normalizeDepartment(name);
      return departmentDisplayColor(
        byName.get(name) ?? byName.get(normalized) ?? employeeColor(name),
        normalized,
      );
    };
  }, [departments]);

  const value = useMemo<Ctx>(
    () => ({ departments, refresh, getColor }),
    [departments, refresh, getColor],
  );

  return <DepartmentsCtx.Provider value={value}>{children}</DepartmentsCtx.Provider>;
}

function useCtx(): Ctx {
  const ctx = useContext(DepartmentsCtx);
  if (!ctx) {
    throw new Error("useDepartments must be used inside <DepartmentsProvider>");
  }
  return ctx;
}

export function useDepartments(): DepartmentMaster[] {
  return useCtx().departments;
}

export function useRefreshDepartments(): () => Promise<void> {
  return useCtx().refresh;
}

/** 단일 부서명에 대한 현재 테마용 표시색을 반환한다. 원본 hex는 보존된다. */
export function useDeptColor(name?: string | null): string {
  return useCtx().getColor(name);
}

/** 함수형 helper (hook 사용 불가한 곳)에 넘겨줄 lookup 클로저. */
export function useDeptColorLookup(): (name?: string | null) => string {
  return useCtx().getColor;
}
