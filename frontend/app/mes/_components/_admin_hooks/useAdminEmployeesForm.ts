"use client";

import { useEffect, useMemo, useState } from "react";
import type { DepartmentRole, Employee, EmployeeLevel, WarehouseRole } from "@/lib/api";
import { EMPTY_EMPLOYEE_FORM, type EmployeeAddForm } from "../_admin_sections/adminShared";

/**
 * Round-15 (#2) 추출 — useAdminEmployees 의 form/selection 부분.
 *
 * 책임:
 *   - selectedEmployee + 외부 employees 변경에 따른 동기화
 *   - empAddMode + empAddForm
 *   - editForm + selectedEmployee → editForm 자동 채움
 */
export type EmployeeEditForm = {
  name: string;
  role: string;
  phone: string;
  department: string;
  level: EmployeeLevel;
  warehouse_role: WarehouseRole;
  department_role: DepartmentRole;
  /** 직원별 좌측 사이드바/모바일 탭 숨김 목록. */
  hidden_sidebar_tabs: string[];
  /** 조립 부서 직원의 담당 모델 slot 목록 (배열 순서 = 우선순위, 0=1순위). */
  assigned_model_slots: number[];
};

const EMPTY_EDIT_FORM: EmployeeEditForm = {
  name: "",
  role: "",
  phone: "",
  department: "조립",
  level: "staff",
  warehouse_role: "none",
  department_role: "none",
  hidden_sidebar_tabs: [],
  assigned_model_slots: [],
};

function toEditForm(emp: Employee): EmployeeEditForm {
  return {
    name: emp.name,
    role: emp.role,
    phone: emp.phone ?? "",
    department: emp.department,
    level: (emp.level ?? "staff") as EmployeeLevel,
    warehouse_role: (emp.warehouse_role ?? "none") as WarehouseRole,
    department_role: (emp.department_role ?? "none") as DepartmentRole,
    hidden_sidebar_tabs: emp.hidden_sidebar_tabs ?? [],
    assigned_model_slots: emp.assigned_model_slots ?? [],
  };
}

export function useAdminEmployeesForm(employees: Employee[]) {
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [empAddMode, setEmpAddMode] = useState(false);
  const [empAddForm, setEmpAddForm] = useState<EmployeeAddForm>(EMPTY_EMPLOYEE_FORM);
  const [editForm, setEditForm] = useState<EmployeeEditForm>(EMPTY_EDIT_FORM);

  // 외부 employees 변경 시 selectedEmployee 동기화
  useEffect(() => {
    if (!selectedEmployee) return;
    const synced = employees.find((e) => e.employee_id === selectedEmployee.employee_id);
    if (synced && synced !== selectedEmployee) {
      setSelectedEmployee(synced);
    }
  }, [employees, selectedEmployee]);

  // 직원 선택 시 editForm 채우기
  useEffect(() => {
    if (selectedEmployee) {
      setEditForm(toEditForm(selectedEmployee));
    } else {
      setEditForm(EMPTY_EDIT_FORM);
    }
  }, [selectedEmployee]);

  function resetAddForm() {
    setEmpAddForm(() => EMPTY_EMPLOYEE_FORM);
    setEmpAddMode(false);
  }

  // PR-2 2-3: 저장 안 한 편집 여부.
  // selectedEmployee 의 원본 vs 현재 editForm 비교.
  const dirty = useMemo(() => {
    if (!selectedEmployee) return false;
    const orig = toEditForm(selectedEmployee);
    if (orig.name !== editForm.name) return true;
    if (orig.role !== editForm.role) return true;
    if (orig.phone !== editForm.phone) return true;
    if (orig.department !== editForm.department) return true;
    if (orig.level !== editForm.level) return true;
    if (orig.warehouse_role !== editForm.warehouse_role) return true;
    if (orig.department_role !== editForm.department_role) return true;
    const hiddenA = orig.hidden_sidebar_tabs;
    const hiddenB = editForm.hidden_sidebar_tabs;
    if (hiddenA.length !== hiddenB.length) return true;
    for (let i = 0; i < hiddenA.length; i += 1) {
      if (hiddenA[i] !== hiddenB[i]) return true;
    }
    const a = orig.assigned_model_slots;
    const b = editForm.assigned_model_slots;
    if (a.length !== b.length) return true;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return true;
    }
    return false;
  }, [selectedEmployee, editForm]);

  return {
    selectedEmployee, setSelectedEmployee,
    empAddMode, setEmpAddMode,
    empAddForm, setEmpAddForm,
    editForm, setEditForm,
    resetAddForm,
    dirty,
  };
}
