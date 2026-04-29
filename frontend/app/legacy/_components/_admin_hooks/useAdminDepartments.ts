"use client";

import { useState } from "react";
import type { DepartmentMaster } from "@/lib/api";
import { api } from "@/lib/api";

export type UseAdminDepartmentsArgs = {
  departments: DepartmentMaster[];
  setDepartments: (updater: (prev: DepartmentMaster[]) => DepartmentMaster[]) => void;
  onStatusChange: (msg: string) => void;
  onError: (msg: string) => void;
};

export type AdminDepartmentsState = {
  departments: DepartmentMaster[];
  addName: string;
  setAddName: (v: string) => void;
  addDepartmentMaster: () => void;
  deactivateDepartmentMaster: (id: number) => void;
  reactivateDepartmentMaster: (id: number) => void;
};

export function useAdminDepartments({
  departments,
  setDepartments,
  onStatusChange,
  onError,
}: UseAdminDepartmentsArgs): AdminDepartmentsState {
  const [addName, setAddName] = useState("");

  function _addDepartment() {
    const name = addName.trim();
    if (!name) return;
    void api
      .createDepartment({ name, display_order: departments.length })
      .then((created) => {
        setDepartments((prev) => [...prev, created]);
        setAddName("");
        onStatusChange(`'${created.name}' 부서를 추가했습니다.`);
      })
      .catch((err: unknown) => onError(err instanceof Error ? err.message : "부서 추가 실패"));
  }

  function _deactivateDepartment(id: number) {
    const dept = departments.find((d) => d.id === id);
    if (!dept) return;
    if (!confirm(`'${dept.name}' 부서를 비활성화하시겠습니까?`)) return;
    void api
      .updateDepartment(id, { is_active: false })
      .then((updated) => {
        setDepartments((prev) => prev.map((d) => (d.id === id ? updated : d)));
        onStatusChange(`'${dept.name}' 부서를 비활성화했습니다.`);
      })
      .catch((err: unknown) => onError(err instanceof Error ? err.message : "비활성화 실패"));
  }

  function _reactivateDepartment(id: number) {
    const dept = departments.find((d) => d.id === id);
    if (!dept) return;
    void api
      .updateDepartment(id, { is_active: true })
      .then((updated) => {
        setDepartments((prev) => prev.map((d) => (d.id === id ? updated : d)));
        onStatusChange(`'${dept.name}' 부서를 활성화했습니다.`);
      })
      .catch((err: unknown) => onError(err instanceof Error ? err.message : "활성화 실패"));
  }

  return {
    departments,
    addName,
    setAddName,
    addDepartmentMaster: _addDepartment,
    deactivateDepartmentMaster: _deactivateDepartment,
    reactivateDepartmentMaster: _reactivateDepartment,
  };
}
