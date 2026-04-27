"use client";

// AdminEmployeesSection 전용 hook.

import { useEffect, useState } from "react";
import type { Employee } from "@/lib/api";
import { api } from "@/lib/api";
import { EMPTY_EMPLOYEE_FORM, type EmployeeAddForm } from "../_admin_sections/adminShared";

export type UseAdminEmployeesArgs = {
  employees: Employee[];
  setEmployees: (updater: (prev: Employee[]) => Employee[]) => void;
  onStatusChange: (msg: string) => void;
  onError: (msg: string) => void;
};

export type AdminEmployeesState = {
  employees: Employee[];
  selectedEmployee: Employee | null;
  setSelectedEmployee: (e: Employee | null) => void;
  empAddMode: boolean;
  setEmpAddMode: (v: boolean) => void;
  empAddForm: EmployeeAddForm;
  setEmpAddForm: (updater: (f: EmployeeAddForm) => EmployeeAddForm) => void;
  addEmployee: () => void;
  toggleEmployee: (employee: Employee) => void;
  confirmTarget: Employee | null;
  confirmToggle: () => void;
  cancelConfirm: () => void;
};

export function useAdminEmployees({
  employees,
  setEmployees,
  onStatusChange,
  onError,
}: UseAdminEmployeesArgs): AdminEmployeesState {
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [empAddMode, setEmpAddMode] = useState(false);
  const [empAddForm, setEmpAddForm] = useState<EmployeeAddForm>(EMPTY_EMPLOYEE_FORM);
  const [confirmTarget, setConfirmTarget] = useState<Employee | null>(null);

  useEffect(() => {
    if (!selectedEmployee) return;
    const synced = employees.find((e) => e.employee_id === selectedEmployee.employee_id);
    if (synced && synced.is_active !== selectedEmployee.is_active) {
      setSelectedEmployee(synced);
    }
  }, [employees]);

  async function _addEmployee() {
    if (!empAddForm.employee_code.trim() || !empAddForm.name.trim()) {
      onError("직원코드와 이름은 필수입니다.");
      return;
    }
    try {
      const created = await api.createEmployee({
        employee_code: empAddForm.employee_code.trim(),
        name: empAddForm.name.trim(),
        role: empAddForm.role.trim(),
        department: empAddForm.department as Employee["department"],
        phone: empAddForm.phone.trim() || undefined,
        display_order: employees.length + 1,
      });
      setEmployees((current) => [...current, created]);
      setEmpAddMode(false);
      setEmpAddForm(() => EMPTY_EMPLOYEE_FORM);
      setSelectedEmployee(created);
      onStatusChange(`'${created.name}' 직원을 추가했습니다.`);
    } catch (error) {
      onError(error instanceof Error ? error.message : "직원 추가에 실패했습니다.");
    }
  }

  async function _doToggleEmployee(employee: Employee) {
    try {
      const updated = await api.updateEmployee(employee.employee_id, { is_active: !employee.is_active });
      setEmployees((current) =>
        current.map((entry) => (entry.employee_id === employee.employee_id ? updated : entry)),
      );
      setSelectedEmployee(updated);
      setConfirmTarget(null);
      onStatusChange(`${updated.name} 직원 상태를 변경했습니다.`);
    } catch (error) {
      setConfirmTarget(null);
      onError(error instanceof Error ? error.message : "직원 상태 변경 실패");
    }
  }

  return {
    employees,
    selectedEmployee,
    setSelectedEmployee,
    empAddMode,
    setEmpAddMode,
    empAddForm,
    setEmpAddForm,
    addEmployee: () => void _addEmployee(),
    toggleEmployee: (e) => setConfirmTarget(e),
    confirmTarget,
    confirmToggle: () => { if (confirmTarget) void _doToggleEmployee(confirmTarget); },
    cancelConfirm: () => setConfirmTarget(null),
  };
}
