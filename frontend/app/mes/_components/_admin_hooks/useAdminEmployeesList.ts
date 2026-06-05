"use client";

// W5: Employees 도메인 List sub-hook.
// 책임: 직원 목록 + search/deptFilter + 정렬된 visibleItems.
// 현재는 AdminEmployeesSection 안에 inline 으로 존재하던 로직을 hook 으로 추출 (점진 마이그레이션).

import { useMemo, useState } from "react";
import type { Employee } from "@/lib/api";
import { normalizeDepartment } from "@/lib/mes/department";

export type EmployeeFilter = {
  search: string;
  deptFilter: string; // "ALL" | 부서명
};

export type UseAdminEmployeesListArgs = {
  employees: Employee[];
};

export type UseAdminEmployeesListState = {
  items: Employee[];
  search: string;
  setSearch: (v: string) => void;
  deptFilter: string;
  setDeptFilter: (v: string) => void;
  filter: EmployeeFilter;
  visibleItems: Employee[];
  deptOptions: string[];
};

export function useAdminEmployeesList({
  employees,
}: UseAdminEmployeesListArgs): UseAdminEmployeesListState {
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("ALL");

  const deptOptions = useMemo(() => {
    const seen = new Set<string>();
    employees.forEach((e) => {
      if (e.department) seen.add(normalizeDepartment(e.department));
    });
    return ["ALL", ...Array.from(seen).sort()];
  }, [employees]);

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees
      .filter((e) => deptFilter === "ALL" || normalizeDepartment(e.department) === deptFilter)
      .filter(
        (e) =>
          !q ||
          e.name.toLowerCase().includes(q) ||
          normalizeDepartment(e.department).toLowerCase().includes(q) ||
          (e.role ?? "").toLowerCase().includes(q),
      )
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [employees, search, deptFilter]);

  return {
    items: employees,
    search,
    setSearch,
    deptFilter,
    setDeptFilter,
    filter: { search, deptFilter },
    visibleItems,
    deptOptions,
  };
}
