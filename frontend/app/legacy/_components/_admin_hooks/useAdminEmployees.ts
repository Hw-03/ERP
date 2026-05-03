"use client";

// AdminEmployeesSection 전용 hook.
// Round-15 (#2): form/confirm sub-hook 으로 분리, 본 hook 은 4 async operation 조율.

import type { DepartmentMaster, Employee } from "@/lib/api";
import { api } from "@/lib/api";
import { useAdminEmployeesForm, type EmployeeEditForm } from "./useAdminEmployeesForm";
import { useAdminEmployeesConfirm } from "./useAdminEmployeesConfirm";
import type { EmployeeAddForm } from "../_admin_sections/adminShared";

export type { EmployeeEditForm } from "./useAdminEmployeesForm";

export type UseAdminEmployeesArgs = {
  employees: Employee[];
  setEmployees: (updater: (prev: Employee[]) => Employee[]) => void;
  departments: DepartmentMaster[];
  onStatusChange: (msg: string) => void;
  onError: (msg: string) => void;
};

export type AdminEmployeesState = {
  employees: Employee[];
  departments: DepartmentMaster[];
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
  pinResetAdminPin: string;
  setPinResetAdminPin: (v: string) => void;
  pinResetError: string;
  requestPinReset: (employee: Employee) => void;
  confirmPinReset: () => void;
  cancelPinReset: () => void;
  /* 삭제 */
  deleteTarget: Employee | null;
  requestDelete: (employee: Employee) => void;
  confirmDelete: () => void;
  cancelDelete: () => void;
};

export function useAdminEmployees({
  employees,
  setEmployees,
  departments,
  onStatusChange,
  onError,
}: UseAdminEmployeesArgs): AdminEmployeesState {
  const form = useAdminEmployeesForm(employees);
  const confirm = useAdminEmployeesConfirm();

  async function _addEmployee() {
    if (!form.empAddForm.employee_code.trim() || !form.empAddForm.name.trim()) {
      onError("직원코드와 이름은 필수입니다.");
      return;
    }
    try {
      const created = await api.createEmployee({
        employee_code: form.empAddForm.employee_code.trim(),
        name: form.empAddForm.name.trim(),
        role: form.empAddForm.role.trim(),
        department: form.empAddForm.department as Employee["department"],
        phone: form.empAddForm.phone.trim() || undefined,
        warehouse_role: form.empAddForm.warehouse_role,
        display_order: employees.length + 1,
      });
      setEmployees((current) => [...current, created]);
      form.resetAddForm();
      form.setSelectedEmployee(created);
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
      form.setSelectedEmployee(updated);
      confirm.setConfirmTarget(null);
      onStatusChange(`${updated.name} 직원 상태를 변경했습니다.`);
    } catch (error) {
      confirm.setConfirmTarget(null);
      onError(error instanceof Error ? error.message : "직원 상태 변경 실패");
    }
  }

  async function _saveEmployee() {
    if (!form.selectedEmployee) return;
    if (!form.editForm.name.trim()) {
      onError("이름은 필수입니다.");
      return;
    }
    try {
      const updated = await api.updateEmployee(form.selectedEmployee.employee_id, {
        name: form.editForm.name.trim(),
        role: form.editForm.role.trim(),
        phone: form.editForm.phone.trim() || undefined,
        department: form.editForm.department as Employee["department"],
        level: form.editForm.level,
        warehouse_role: form.editForm.warehouse_role,
        display_order: form.editForm.display_order,
      });
      setEmployees((current) =>
        current.map((e) => (e.employee_id === updated.employee_id ? updated : e)),
      );
      form.setSelectedEmployee(updated);
      onStatusChange(`'${updated.name}' 정보를 저장했습니다.`);
    } catch (error) {
      onError(error instanceof Error ? error.message : "직원 정보 저장 실패");
    }
  }

  async function _doDeleteEmployee(employee: Employee) {
    try {
      const result = await api.deleteEmployee(employee.employee_id);
      if (result.result === "deleted") {
        setEmployees((current) => current.filter((e) => e.employee_id !== employee.employee_id));
        form.setSelectedEmployee(null);
        onStatusChange(`'${employee.name}' 직원을 영구 삭제했습니다.`);
      } else {
        const updated = { ...employee, is_active: false };
        setEmployees((current) =>
          current.map((e) => (e.employee_id === employee.employee_id ? updated : e)),
        );
        form.setSelectedEmployee(updated);
        onStatusChange(`'${employee.name}' 직원을 비활성화했습니다. (거래 이력 보존)`);
      }
      confirm.setDeleteTarget(null);
    } catch (error) {
      confirm.setDeleteTarget(null);
      onError(error instanceof Error ? error.message : "직원 삭제 실패");
    }
  }

  async function _doResetPin(employee: Employee) {
    if (!confirm.pinResetAdminPin.trim()) {
      confirm.setPinResetError("관리자 PIN을 입력하세요.");
      return;
    }
    try {
      await api.resetEmployeePin(employee.employee_id, confirm.pinResetAdminPin.trim());
      confirm.setPinResetTarget(null);
      confirm.setPinResetAdminPin("");
      confirm.setPinResetError("");
      onStatusChange(`'${employee.name}' PIN을 0000으로 초기화했습니다.`);
    } catch (error) {
      confirm.setPinResetError(error instanceof Error ? error.message : "PIN 초기화 실패");
    }
  }

  return {
    employees,
    departments,
    selectedEmployee: form.selectedEmployee,
    setSelectedEmployee: form.setSelectedEmployee,
    empAddMode: form.empAddMode,
    setEmpAddMode: form.setEmpAddMode,
    empAddForm: form.empAddForm,
    setEmpAddForm: form.setEmpAddForm,
    addEmployee: () => void _addEmployee(),
    toggleEmployee: (e) => confirm.setConfirmTarget(e),
    confirmTarget: confirm.confirmTarget,
    confirmToggle: () => { if (confirm.confirmTarget) void _doToggleEmployee(confirm.confirmTarget); },
    cancelConfirm: () => confirm.setConfirmTarget(null),
    editForm: form.editForm,
    setEditForm: form.setEditForm,
    saveEmployee: () => void _saveEmployee(),
    pinResetTarget: confirm.pinResetTarget,
    pinResetAdminPin: confirm.pinResetAdminPin,
    setPinResetAdminPin: confirm.setPinResetAdminPin,
    pinResetError: confirm.pinResetError,
    requestPinReset: confirm.requestPinReset,
    confirmPinReset: () => { if (confirm.pinResetTarget) void _doResetPin(confirm.pinResetTarget); },
    cancelPinReset: confirm.cancelPinReset,
    deleteTarget: confirm.deleteTarget,
    requestDelete: (e) => confirm.setDeleteTarget(e),
    confirmDelete: () => { if (confirm.deleteTarget) void _doDeleteEmployee(confirm.deleteTarget); },
    cancelDelete: () => confirm.setDeleteTarget(null),
  };
}
