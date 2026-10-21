"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DepartmentRole, Employee, WarehouseRole } from "@/lib/api";
import { EMPTY_EMPLOYEE_FORM, type EmployeeAddForm } from "../_admin_sections/adminShared";
import { normalizeEmployeePosition } from "../_admin_sections/_employee_parts/employeeRoleLabels";
import { useAdminSessionState } from "./useAdminSessionState";

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
  warehouse_role: WarehouseRole;
  department_role: DepartmentRole;
  as_research_approver: boolean;
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
  warehouse_role: "none",
  department_role: "none",
  as_research_approver: false,
  hidden_sidebar_tabs: [],
  assigned_model_slots: [],
};

function toEditForm(emp: Employee): EmployeeEditForm {
  return {
    name: emp.name,
    role: normalizeEmployeePosition(emp.role),
    phone: emp.phone ?? "",
    department: emp.department,
    warehouse_role: (emp.warehouse_role ?? "none") as WarehouseRole,
    department_role: (emp.department_role ?? "none") as DepartmentRole,
    as_research_approver: emp.as_research_approver ?? false,
    hidden_sidebar_tabs: emp.hidden_sidebar_tabs ?? [],
    assigned_model_slots: emp.assigned_model_slots ?? [],
  };
}

export function useAdminEmployeesForm(employees: Employee[]) {
  const [selectedId, setSelectedId] = useAdminSessionState<string | null>("employees.selection", null);
  const [selectedEmployee, setSelection] = useState<Employee | null>(() => employees.find((employee) => employee.employee_id === selectedId) ?? null);
  const [empAddMode, setEmpAddMode] = useState(false);
  const [empAddForm, setEmpAddForm] = useState<EmployeeAddForm>(EMPTY_EMPLOYEE_FORM);
  const [editForm, setEditForm] = useState<EmployeeEditForm>(() => selectedEmployee ? toEditForm(selectedEmployee) : EMPTY_EDIT_FORM);

  // 명시적 선택과 저장 응답은 새 편집 기준으로 사용한다.
  const setSelectedEmployee = useCallback((employee: Employee | null) => {
    setSelectedId(employee?.employee_id ?? null);
    setSelection(employee);
    setEditForm(employee ? toEditForm(employee) : EMPTY_EDIT_FORM);
  }, [setSelectedId]);

  useEffect(() => {
    if (!selectedEmployee && selectedId) {
      const restored = employees.find((employee) => employee.employee_id === selectedId);
      if (restored) setSelectedEmployee(restored);
    }
  }, [employees, selectedId, selectedEmployee, setSelectedEmployee]);

  // 외부 employees 변경 시 selectedEmployee 동기화
  useEffect(() => {
    if (!selectedEmployee) return;
    const synced = employees.find((e) => e.employee_id === selectedEmployee.employee_id);
    if (synced && synced !== selectedEmployee) {
      setEditForm((current) => {
        const previous = toEditForm(selectedEmployee);
        const next = toEditForm(synced);
        const localChanges = Object.fromEntries(Object.entries(current).filter(([key, value]) =>
          key !== "hidden_sidebar_tabs"
          && JSON.stringify(value) !== JSON.stringify(previous[key as keyof EmployeeEditForm]),
        ));
        // 숨김 목록은 탭별로 병합해 다른 탭의 미저장 체크를 유지한다.
        const tabs = new Set([...next.hidden_sidebar_tabs, ...current.hidden_sidebar_tabs]);
        const hidden_sidebar_tabs = [...tabs].filter((tab) => {
          const localHidden = current.hidden_sidebar_tabs.includes(tab);
          return localHidden !== previous.hidden_sidebar_tabs.includes(tab)
            ? localHidden
            : next.hidden_sidebar_tabs.includes(tab);
        });
        return { ...next, ...localChanges, hidden_sidebar_tabs };
      });
      setSelection(synced);
    }
  }, [employees, selectedEmployee]);

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
    if (orig.warehouse_role !== editForm.warehouse_role) return true;
    if (orig.department_role !== editForm.department_role) return true;
    if (orig.as_research_approver !== editForm.as_research_approver) return true;
    const hiddenA = new Set(orig.hidden_sidebar_tabs);
    const hiddenB = new Set(editForm.hidden_sidebar_tabs);
    if (hiddenA.size !== hiddenB.size) return true;
    if ([...hiddenA].some((tab) => !hiddenB.has(tab))) return true;
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
