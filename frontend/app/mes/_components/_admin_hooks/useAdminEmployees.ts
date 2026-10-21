"use client";

// AdminEmployeesSection 전용 wrapper hook.
// W5: List/Form/Commands 3-hook 으로 분해.
// — Form/Confirm sub-hook 은 Round-15 부터 존재 — Commands 추출 + List 추출로 표준화.

import type { DepartmentMaster, Employee } from "@/lib/api";
import { useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queries/keys";
import { getOperatorAccessContext, updateCurrentOperatorAccess } from "../login/useCurrentOperator";
import { useAdminEmployeesForm, type EmployeeEditForm } from "./useAdminEmployeesForm";
import { useAdminEmployeesConfirm } from "./useAdminEmployeesConfirm";
import { useAdminEmployeesCommands } from "./useAdminEmployeesCommands";
import type { EmployeeAddForm } from "../_admin_sections/adminShared";
import { useAdminSave } from "./useAdminSave";

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
  addEmployee: () => Promise<void>;
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
  saving: boolean;
  adding: boolean;
  toggling: boolean;
  deleting: boolean;
  resettingPin: boolean;
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
  const queryClient = useQueryClient();
  const saveTask = useAdminSave();
  const form = useAdminEmployeesForm(employees);
  const selectedId = useRef(form.selectedEmployee?.employee_id);
  useEffect(() => {
    selectedId.current = form.selectedEmployee?.employee_id;
    return () => { selectedId.current = undefined; };
  }, [form.selectedEmployee?.employee_id]);
  const confirm = useAdminEmployeesConfirm();
  const commands = useAdminEmployeesCommands({ setEmployees, onStatusChange, onError });

  async function addEmployee(): Promise<void> {
    const created = await commands.add(form.empAddForm);
    if (!created) throw new Error("직원을 추가하지 못했습니다. 입력 내용을 확인하고 다시 시도하세요.");
    form.resetAddForm();
    form.setSelectedEmployee(created);
  }

  function confirmToggle() {
    const target = confirm.confirmTarget;
    if (!target) return;
    void commands.toggleActive(target).then((updated) => {
      if (updated) {
        confirm.setConfirmTarget(null);
        form.setSelectedEmployee(updated);
      }
    });
  }

  async function saveEmployee() {
    if (!form.selectedEmployee) return;
    if (!form.editForm.name.trim()) {
      onError("이름은 필수입니다.");
      throw new Error("이름은 필수입니다.");
    }
    const isAssembly = form.editForm.department === "조립";
    const savingOperator = getOperatorAccessContext();
    try {
      const updated = await api.updateEmployee(
        form.selectedEmployee.employee_id,
        {
          name: form.editForm.name.trim(),
          role: form.editForm.role.trim(),
          phone: form.editForm.phone.trim() || undefined,
          department: form.editForm.department as Employee["department"],
          warehouse_role: form.editForm.warehouse_role,
          department_role: form.editForm.department_role,
          as_research_approver: form.editForm.as_research_approver,
          hidden_sidebar_tabs: form.editForm.hidden_sidebar_tabs,
          assigned_model_slots: isAssembly ? form.editForm.assigned_model_slots : [],
        },
      );
      const currentOperator = getOperatorAccessContext();
      if (savingOperator && currentOperator?.login === savingOperator.login && currentOperator.employeeId === savingOperator.employeeId) {
        updateCurrentOperatorAccess(updated);
      }
      void queryClient.cancelQueries({ queryKey: queryKeys.employees.accessAll }).then(() =>
        queryClient.invalidateQueries({ queryKey: queryKeys.employees.all }),
      );
      setEmployees((current) =>
        current.map((e) => (e.employee_id === updated.employee_id ? updated : e)),
      );
      if (selectedId.current === updated.employee_id) form.setSelectedEmployee(updated);
      onStatusChange(`'${updated.name}' 정보를 저장했습니다.`);
    } catch (error) {
      onError(error instanceof Error ? error.message : "직원 정보 저장 실패");
      throw error;
    }
  }

  function confirmDelete() {
    const target = confirm.deleteTarget;
    if (!target) return;
    void commands.delete(target).then((result) => {
      if (!result) return;
      confirm.setDeleteTarget(null);
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
    saveEmployee: () => saveTask.run(saveEmployee),
    saving: saveTask.saving,
    adding: commands.adding,
    toggling: commands.toggling,
    deleting: commands.deleting,
    resettingPin: commands.resettingPin,
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
