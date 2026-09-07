"use client";

// AdminDepartmentsSection 전용 wrapper hook.
// List/Form/Commands sub-hook의 단일 React Query 표면을 유지한다.

import { useMemo, useRef } from "react";
import type { DepartmentMaster } from "@/lib/api";
import {
  useAdminDepartmentsForm,
  type DepartmentDetailForm,
  type SaveResult,
} from "./useAdminDepartmentsForm";
import { useAdminDepartmentsCommands } from "./useAdminDepartmentsCommands";

export { COLOR_PALETTE } from "./useAdminDepartmentsCommands";

export type UseAdminDepartmentsArgs = {
  departments: DepartmentMaster[];
  selectedDept: DepartmentMaster | null;
  setSelectedDept: (department: DepartmentMaster | null) => void;
  onStatusChange: (message: string) => void;
  onError: (message: string) => void;
  adminPin: string;
};

export type AdminDepartmentsState = {
  departments: DepartmentMaster[];
  addName: string;
  setAddName: (value: string) => void;
  selectedDept: DepartmentMaster | null;
  setSelectedDept: (department: DepartmentMaster | null) => void;
  addDepartmentMaster: () => Promise<DepartmentMaster | null>;
  deactivateDepartmentMaster: (id: number) => Promise<DepartmentMaster | null>;
  reactivateDepartmentMaster: (id: number) => Promise<DepartmentMaster | null>;
  hardDeleteDepartment: (id: number) => Promise<boolean>;
  reorderDepartments: (ordered: DepartmentMaster[]) => Promise<boolean>;
  updateDepartmentColor: (id: number, colorHex: string) => Promise<DepartmentMaster | null>;
  detailForm: DepartmentDetailForm;
  setDetailForm: React.Dispatch<React.SetStateAction<DepartmentDetailForm>>;
  saveDepartment: () => Promise<SaveResult>;
  dirty: boolean;
};

export function useAdminDepartments({
  departments,
  selectedDept,
  setSelectedDept,
  onStatusChange,
  onError,
  adminPin,
}: UseAdminDepartmentsArgs): AdminDepartmentsState {
  const visibleItems = useMemo(() => departments, [departments]);
  const canonicalSelectedDept = selectedDept
    ? departments.find((department) => department.id === selectedDept.id) ?? selectedDept
    : null;
  const form = useAdminDepartmentsForm({
    department: canonicalSelectedDept,
    adminPin,
    onStatusChange,
    onError,
    onSaved: setSelectedDept,
  });

  const addNameRef = useRef(form.form.addName);
  addNameRef.current = form.form.addName;

  const commands = useAdminDepartmentsCommands({
    departments,
    selectedDept: canonicalSelectedDept,
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
    selectedDept: canonicalSelectedDept,
    setSelectedDept,
    addDepartmentMaster: commands.add,
    deactivateDepartmentMaster: commands.deactivate,
    reactivateDepartmentMaster: commands.reactivate,
    hardDeleteDepartment: commands.hardDelete,
    reorderDepartments: commands.reorder,
    updateDepartmentColor: commands.updateColor,
    detailForm: form.detailForm,
    setDetailForm: form.setDetailForm,
    saveDepartment: form.save,
    dirty: form.dirty,
  };
}
