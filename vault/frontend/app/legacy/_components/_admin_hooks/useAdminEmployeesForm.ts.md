---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_admin_hooks/useAdminEmployeesForm.ts
tags: [vault, code-note, auto-generated, stub]
---

# useAdminEmployeesForm.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_admin_hooks/useAdminEmployeesForm.ts]]

## 원본 첫 줄

```
"use client";

import { useEffect, useState } from "react";
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
  /** 조립 부서 직원의 담당 모델 slot 목록 (배열 순서 = 우선순위, 0=1순위). */
  assigned_model_slots: number[];
};

const EMPTY_EDIT_FORM: EmployeeEditForm = {
  name: "",
  role: "",
  phone: "",
```
