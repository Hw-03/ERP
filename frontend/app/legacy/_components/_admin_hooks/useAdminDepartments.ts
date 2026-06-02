"use client";

// AdminDepartmentsSection 전용 wrapper hook.
// W5: List/Form/Commands 3-hook 으로 분해 후 호환 표면 유지.

import { useMemo, useRef } from "react";
import type { DepartmentMaster } from "@/lib/api";
import { useAdminDepartmentsForm } from "./useAdminDepartmentsForm";
import { useAdminDepartmentsCommands } from "./useAdminDepartmentsCommands";

// Re-export 보조 — 외부에서 import 하던 COLOR_PALETTE 유지.
export { COLOR_PALETTE } from "./useAdminDepartmentsCommands";

export type UseAdminDepartmentsArgs = {
  departments: DepartmentMaster[];
  setDepartments: (updater: (prev: DepartmentMaster[]) => DepartmentMaster[]) => void;
  selectedDept: DepartmentMaster | null;
  setSelectedDept: (d: DepartmentMaster | null) => void;
  onStatusChange: (msg: string) => void;
  onError: (msg: string) => void;
  adminPin: string;
};

export type AdminDepartmentsState = {
  departments: DepartmentMaster[];
  addName: string;
  setAddName: (v: string) => void;
  selectedDept: DepartmentMaster | null;
  setSelectedDept: (d: DepartmentMaster | null) => void;
  addDepartmentMaster: () => void;
  deactivateDepartmentMaster: (id: number) => void;
  reactivateDepartmentMaster: (id: number) => void;
  hardDeleteDepartment: (id: number) => void;
  reorderDepartments: (ordered: DepartmentMaster[]) => void;
  updateDepartmentColor: (id: number, colorHex: string) => void;
  /** 저장되지 않은 편집 여부 (PR-2 unsaved guard에서 읽음) */
  dirty: boolean;
  setDirty: (v: boolean) => void;
};

export function useAdminDepartments({
  departments,
  setDepartments,
  selectedDept,
  setSelectedDept,
  onStatusChange,
  onError,
  adminPin,
}: UseAdminDepartmentsArgs): AdminDepartmentsState {
  // List sub-hook 인라인 — 부서 도메인은 검색·필터 UI 없음 (visibleItems = departments pass-through).
  const visibleItems = useMemo(() => departments, [departments]);
  const form = useAdminDepartmentsForm();

  // commands.add 가 form.addName 을 읽도록 ref 로 전달 (closure stale 방지).
  const addNameRef = useRef(form.form.addName);
  addNameRef.current = form.form.addName;

  const commands = useAdminDepartmentsCommands({
    departments,
    setDepartments,
    selectedDept,
    setSelectedDept,
    onStatusChange,
    onError,
    adminPin,
    getAddName: () => addNameRef.current,
    onAfterAdd: () => form.setAddName(""),
  });

  return {
    departments: visibleItems,
    addName: form.form.addName,
    setAddName: form.setAddName,
    selectedDept,
    setSelectedDept,
    addDepartmentMaster: commands.add,
    deactivateDepartmentMaster: commands.deactivate,
    reactivateDepartmentMaster: commands.reactivate,
    hardDeleteDepartment: commands.hardDelete,
    reorderDepartments: commands.reorder,
    updateDepartmentColor: commands.updateColor,
    dirty: form.dirty,
    setDirty: form.setDirty,
  };
}
