"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, type DepartmentMaster } from "@/lib/api";
import { employeeColor } from "@/lib/mes/color";
import { normalizeDepartment } from "@/lib/mes/department";

type Ctx = {
  departments: DepartmentMaster[];
  refresh: () => Promise<void>;
  getColor: (name?: string | null) => string;
};

const DepartmentsCtx = createContext<Ctx | null>(null);

export function DepartmentsProvider({ children }: { children: ReactNode }) {
  const [departments, setDepartments] = useState<DepartmentMaster[]>([]);
  const inflightRef = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    if (inflightRef.current) return inflightRef.current;
    const p = api
      .getDepartments({ isActive: true })
      .then((rows) => {
        setDepartments(rows);
      })
      .catch(() => {})
      .finally(() => {
        inflightRef.current = null;
      });
    inflightRef.current = p;
    return p;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // departments 가 바뀔 때만 lookup 함수가 새로 만들어지도록.
  const getColor = useMemo(() => {
    const byName = new Map<string, string>();
    for (const d of departments) {
      if (d.color_hex) byName.set(d.name, d.color_hex);
    }
    return (name?: string | null) => {
      if (!name) return employeeColor(name);
      const normalized = normalizeDepartment(name);
      return byName.get(name) ?? byName.get(normalized) ?? employeeColor(name);
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

/** 단일 부서명에 대한 색을 반환. color_hex 우선, 없으면 폴백 팔레트. */
export function useDeptColor(name?: string | null): string {
  return useCtx().getColor(name);
}

/** 함수형 helper (hook 사용 불가한 곳)에 넘겨줄 lookup 클로저. */
export function useDeptColorLookup(): (name?: string | null) => string {
  return useCtx().getColor;
}
