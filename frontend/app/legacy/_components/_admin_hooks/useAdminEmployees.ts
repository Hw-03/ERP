"use client";

// AdminEmployeesSection 전용 wrapper hook.
// W5: List/Form/Commands 3-hook 으로 분해.
// — Form/Confirm sub-hook 은 Round-15 부터 존재 — Commands 추출 + List 추출로 표준화.

import type { DepartmentMaster, Employee } from "@/lib/api";
import { api } from "@/lib/api";
import { useAdminEmployeesForm, type EmployeeEditForm } from "./useAdminEmployeesForm";
import { useAdminEmployeesConfirm } from "./useAdminEmployeesConfirm";
import { useAdminEmployeesCommands } from "./useAdminEmployeesCommands";
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
  saveEmployee: () => Promise<void>;
  /** 저장 안 한 편집 여부 (PR-2 2-3 unsaved guard) */
  dirty: boolean;
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
  const commands = useAdminEmployeesCommands({ setEmployees, onStatusChange, onError });

  function addEmployee() {
    void commands.add(form.empAddForm).then((created) => {
      if (created) {
        form.resetAddForm();
        form.setSelectedEmployee(created);
      }
    });
  }

  function confirmToggle() {
    const target = confirm.confirmTarget;
    if (!target) return;
    void commands.toggleActive(target).then((updated) => {
      confirm.setConfirmTarget(null);
      if (updated) form.setSelectedEmployee(updated);
    });
  }

  async function saveEmployee() {
    if (!form.selectedEmployee) return;
    if (!form.editForm.name.trim()) {
      onError("이름은 필수입니다.");
      return;
    }
    const isAssembly = form.editForm.department === "조립";
    try {
      const updated = await api.updateEmployee(
        form.selectedEmployee.employee_id,
        {
          name: form.editForm.name.trim(),
          role: form.editForm.role.trim(),
          phone: form.editForm.phone.trim() || undefined,
          department: form.editForm.department as Employee["department"],
          level: form.editForm.level,
          warehouse_role: form.editForm.warehouse_role,
          department_role: form.editForm.department_role,
          assigned_model_slots: isAssembly ? form.editForm.assigned_model_slots : [],
        },
      );
      setEmployees((current) =>
        current.map((e) => (e.employee_id === updated.employee_id ? updated : e)),
      );
      form.setSelectedEmployee(updated);
      onStatusChange(`'${updated.name}' 정보를 저장했습니다.`);
    } catch (error) {
      onError(error instanceof Error ? error.message : "직원 정보 저장 실패");
    }
  }

  function confirmDelete() {
    const target = confirm.deleteTarget;
    if (!target) return;
    void commands.delete(target).then((result) => {
      confirm.setDeleteTarget(null);
      if (!result) return;
      if (result.deleted) {
        form.setSelectedEmployee(null);
      } else if (result.updated) {
        form.setSelectedEmployee(result.updated);
      }
    });
  }

  function confirmPinReset() {
    const target = confirm.pinResetTarget;
    if (!target) return;
    if (!confirm.pinResetAdminPin.trim()) {
      confirm.setPinResetError("관리자 PIN을 입력하세요.");
      return;
    }
    void commands.resetPin(target, confirm.pinResetAdminPin).then((ok) => {
      if (ok) {
        confirm.setPinResetTarget(null);
        confirm.setPinResetAdminPin("");
        confirm.setPinResetError("");
      } else {
        confirm.setPinResetError("PIN 초기화 실패");
      }
    });
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
    addEmployee,
    toggleEmployee: (e) => confirm.setConfirmTarget(e),
    confirmTarget: confirm.confirmTarget,
    confirmToggle,
    cancelConfirm: () => confirm.setConfirmTarget(null),
    editForm: form.editForm,
    setEditForm: form.setEditForm,
    saveEmployee,
    dirty: form.dirty,
    pinResetTarget: confirm.pinResetTarget,
    pinResetAdminPin: confirm.pinResetAdminPin,
    setPinResetAdminPin: confirm.setPinResetAdminPin,
    pinResetError: confirm.pinResetError,
    requestPinReset: confirm.requestPinReset,
    confirmPinReset,
    cancelPinReset: confirm.cancelPinReset,
    deleteTarget: confirm.deleteTarget,
    requestDelete: (e) => confirm.setDeleteTarget(e),
    confirmDelete,
    cancelDelete: () => confirm.setDeleteTarget(null),
  };
}
