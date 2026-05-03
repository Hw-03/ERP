"use client";

import { useEffect, useState } from "react";
import type { Employee, EmployeeLevel, WarehouseRole } from "@/lib/api";
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
  display_order: number;
};

const EMPTY_EDIT_FORM: EmployeeEditForm = {
  name: "",
  role: "",
  phone: "",
  department: "조립",
  level: "staff",
  warehouse_role: "none",
  display_order: 0,
};

function toEditForm(emp: Employee): EmployeeEditForm {
  return {
    name: emp.name,
    role: emp.role,
    phone: emp.phone ?? "",
    department: emp.department,
    level: emp.level,
    warehouse_role: (emp.warehouse_role ?? "none") as WarehouseRole,
    display_order: emp.display_order,
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

  return {
    selectedEmployee, setSelectedEmployee,
    empAddMode, setEmpAddMode,
    empAddForm, setEmpAddForm,
    editForm, setEditForm,
    resetAddForm,
  };
}
