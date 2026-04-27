---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_admin_hooks/useAdminEmployees.ts
status: active
updated: 2026-04-27
source_sha: 8890952c8c9f
tags:
  - erp
  - frontend
  - frontend-hook
  - ts
---

# useAdminEmployees.ts

> [!summary] 역할
> 프론트엔드 화면에서 상태, 데이터 로딩, 상호작용 흐름을 재사용하기 위한 React hook이다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_admin_hooks/useAdminEmployees.ts`
- Layer: `frontend`
- Kind: `frontend-hook`
- Size: `3235` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_admin_hooks/_admin_hooks|frontend/app/legacy/_components/_admin_hooks]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````ts
"use client";

// AdminEmployeesSection 전용 hook.

import { useState } from "react";
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

  async function _toggleEmployee(employee: Employee) {
    const action = employee.is_active ? "비활성화" : "활성화";
    const confirmed = window.confirm(`'${employee.name}' 직원을 ${action}하시겠습니까?`);
    if (!confirmed) return;
    try {
      const updated = await api.updateEmployee(employee.employee_id, { is_active: !employee.is_active });
      setEmployees((current) =>
        current.map((entry) => (entry.employee_id === employee.employee_id ? updated : entry)),
      );
      setSelectedEmployee(updated);
      onStatusChange(`${updated.name} 직원 상태를 변경했습니다.`);
    } catch (error) {
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
    toggleEmployee: (e) => void _toggleEmployee(e),
  };
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
