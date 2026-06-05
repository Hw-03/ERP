"use client";

// W5: Employees 도메인 Commands sub-hook.
// 책임: list-level mutation — add (생성) / toggleActive / delete / resetPin.
// 기존 useAdminEmployees.ts 의 4 async operation 을 hook 으로 추출.

import type { Employee } from "@/lib/api";
import {
  useCreateEmployeeMutation,
  useDeleteEmployeeMutation,
  useResetEmployeePinMutation,
  useUpdateEmployeeMutation,
} from "@/lib/queries/useEmployeesQuery";
import type { EmployeeAddForm } from "../_admin_sections/adminShared";

export type UseAdminEmployeesCommandsArgs = {
  setEmployees: (updater: (prev: Employee[]) => Employee[]) => void;
  onStatusChange: (msg: string) => void;
  onError: (msg: string) => void;
};

export type UseAdminEmployeesCommandsState = {
  add: (input: EmployeeAddForm) => Promise<Employee | null>;
  toggleActive: (employee: Employee) => Promise<Employee | null>;
  delete: (employee: Employee) => Promise<{ deleted: boolean; updated: Employee | null } | null>;
  resetPin: (employee: Employee, adminPin: string) => Promise<boolean>;
};

export function useAdminEmployeesCommands({
  setEmployees,
  onStatusChange,
  onError,
}: UseAdminEmployeesCommandsArgs): UseAdminEmployeesCommandsState {
  const createMutation = useCreateEmployeeMutation();
  const updateMutation = useUpdateEmployeeMutation();
  const deleteMutation = useDeleteEmployeeMutation();
  const resetPinMutation = useResetEmployeePinMutation();

  async function add(input: EmployeeAddForm): Promise<Employee | null> {
    if (!input.name.trim()) {
      onError("이름은 필수입니다.");
      return null;
    }
    const isAssembly = input.department === "조립";
    try {
      const created = await createMutation.mutateAsync({
        name: input.name.trim(),
        role: input.role.trim(),
        department: input.department as Employee["department"],
        phone: input.phone.trim() || undefined,
        warehouse_role: input.warehouse_role,
        department_role: input.department_role,
        assigned_model_slots: isAssembly ? input.assigned_model_slots : [],
      });
      setEmployees((current) => [...current, created]);
      onStatusChange(`'${created.name}' 직원을 추가했습니다.`);
      return created;
    } catch (error) {
      onError(error instanceof Error ? error.message : "직원 추가에 실패했습니다.");
      return null;
    }
  }

  async function toggleActive(employee: Employee): Promise<Employee | null> {
    try {
      const updated = await updateMutation.mutateAsync({
        employeeId: employee.employee_id,
        payload: { is_active: !employee.is_active },
      });
      setEmployees((current) =>
        current.map((entry) => (entry.employee_id === employee.employee_id ? updated : entry)),
      );
      onStatusChange(`${updated.name} 직원 상태를 변경했습니다.`);
      return updated;
    } catch (error) {
      onError(error instanceof Error ? error.message : "직원 상태 변경 실패");
      return null;
    }
  }

  async function deleteCmd(
    employee: Employee,
  ): Promise<{ deleted: boolean; updated: Employee | null } | null> {
    try {
      const result = await deleteMutation.mutateAsync(employee.employee_id);
      if (result.result === "deleted") {
        setEmployees((current) => current.filter((e) => e.employee_id !== employee.employee_id));
        onStatusChange(`'${employee.name}' 직원을 영구 삭제했습니다.`);
        return { deleted: true, updated: null };
      } else {
        const updated = { ...employee, is_active: false };
        setEmployees((current) =>
          current.map((e) => (e.employee_id === employee.employee_id ? updated : e)),
        );
        onStatusChange(`'${employee.name}' 직원을 비활성화했습니다. (거래 이력 보존)`);
        return { deleted: false, updated };
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : "직원 삭제 실패");
      return null;
    }
  }

  async function resetPin(employee: Employee, adminPin: string): Promise<boolean> {
    if (!adminPin.trim()) return false;
    try {
      await resetPinMutation.mutateAsync({
        employeeId: employee.employee_id,
        adminPin: adminPin.trim(),
      });
      onStatusChange(`'${employee.name}' PIN을 0000으로 초기화했습니다.`);
      return true;
    } catch (error) {
      onError(error instanceof Error ? error.message : "PIN 초기화 실패");
      return false;
    }
  }

  return {
    add,
    toggleActive,
    delete: deleteCmd,
    resetPin,
  };
}
