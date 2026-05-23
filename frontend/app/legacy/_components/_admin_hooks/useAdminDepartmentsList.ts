"use client";

// W5: Departments 도메인 List sub-hook.
// 책임: 부서 목록 (현재 도메인은 검색·필터 UI 없음 — visibleItems pass-through).

import { useMemo } from "react";
import type { DepartmentMaster } from "@/lib/api";

export type UseAdminDepartmentsListArgs = {
  departments: DepartmentMaster[];
};

export type UseAdminDepartmentsListState = {
  items: DepartmentMaster[];
  visibleItems: DepartmentMaster[];
};

export function useAdminDepartmentsList({
  departments,
}: UseAdminDepartmentsListArgs): UseAdminDepartmentsListState {
  const visibleItems = useMemo(() => departments, [departments]);
  return { items: departments, visibleItems };
}
