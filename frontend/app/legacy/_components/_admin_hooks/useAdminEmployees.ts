"use client";

// AdminEmployeesSection 전용 hook.

import { useEffect, useState } from "react";
import type { Employee, EmployeeLevel } from "@/lib/api";
import { api } from "@/lib/api";
import { EMPTY_EMPLOYEE_FORM, type EmployeeAddForm } from "../_admin_sections/adminShared";

export type EmployeeEditForm = {
  name: string;
  role: string;
  phone: string;
  department: string;
  level: EmployeeLevel;
  display_order: number;
};

const EMPTY_EDIT_FORM: EmployeeEditForm = {
  name: "",
  role: "",
  phone: "",
  department: "조립",
  level: "staff",
  display_order: 0,
};

function toEditForm(emp: Employee): EmployeeEditForm {
  return {
    name: emp.name,
    role: emp.role,
    phone: emp.phone ?? "",
    department: emp.department,
    level: emp.level,
    display_order: emp.display_order,
  };
}

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
  /* 2차: 정보 수정 / PIN 초기화 */
  editForm: EmployeeEditForm;
  setEditForm: (updater: (f: EmployeeEditForm) => EmployeeEditForm) => void;
  saveEmployee: () => void;
  pinResetTarget: Employee | null;
  requestPinReset: (employee: Employee) => void;
  confirmPinReset: () => void;
  cancelPinReset: () => void;
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
  const [editForm, setEditForm] = useState<EmployeeEditForm>(EMPTY_EDIT_FORM);
  const [pinResetTarget, setPinResetTarget] = useState<Employee | null>(null);

  // 선택된 직원이 외부 employees 변경 시 동기화 + editForm 초기화
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

  async function _saveEmployee() {
    if (!selectedEmployee) return;
    if (!editForm.name.trim()) {
      onError("이름은 필수입니다.");
      return;
    }
    try {
      const updated = await api.updateEmployee(selectedEmployee.employee_id, {
        name: editForm.name.trim(),
        role: editForm.role.trim(),
        phone: editForm.phone.trim() || undefined,
        department: editForm.department as Employee["department"],
        level: editForm.level,
        display_order: editForm.display_order,
      });
      setEmployees((current) =>
        current.map((e) => (e.employee_id === updated.employee_id ? updated : e)),
      );
      setSelectedEmployee(updated);
      onStatusChange(`'${updated.name}' 정보를 저장했습니다.`);
    } catch (error) {
      onError(error instanceof Error ? error.message : "직원 정보 저장 실패");
    }
  }

  async function _doResetPin(employee: Employee) {
    try {
      await api.resetEmployeePin(employee.employee_id);
      setPinResetTarget(null);
      onStatusChange(`'${employee.name}' PIN을 0000으로 초기화했습니다.`);
    } catch (error) {
      setPinResetTarget(null);
      onError(error instanceof Error ? error.message : "PIN 초기화 실패");
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
    editForm,
    setEditForm,
    saveEmployee: () => void _saveEmployee(),
    pinResetTarget,
    requestPinReset: (e) => setPinResetTarget(e),
    confirmPinReset: () => { if (pinResetTarget) void _doResetPin(pinResetTarget); },
    cancelPinReset: () => setPinResetTarget(null),
  };
}
